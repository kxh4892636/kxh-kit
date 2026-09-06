package desktop

import (
	"fmt"
	"github.com/lxn/win"

	"kxh.dev/dsh-manager/internal/manager"
	"kxh.dev/dsh-manager/internal/settings"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func waitFor(t *testing.T, f func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if f() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("等待原生界面结果超时")
}
func TestMain(m *testing.M) {
	className = fmt.Sprintf("KxhDSHManagerTests-%d", os.Getpid())
	os.Exit(m.Run())
}

func TestNativeValidationPreservesConfigAndShowsErrors(t *testing.T) {
	m := desktopManager(t)
	done := make(chan error, 1)
	go func() { done <- Run(m, true) }()
	var hwnd win.HWND
	waitFor(t, func() bool {
		hwnd = win.FindWindow(text(className), nil)
		return hwnd != 0 && win.GetDlgItem(hwnd, idLog) != 0
	})
	defer func() { win.PostMessage(hwnd, win.WM_CLOSE, 0, 0); <-done }()
	setText(win.GetDlgItem(hwnd, idPort), "")
	win.SendMessage(hwnd, win.WM_COMMAND, idSave, 0)
	waitFor(t, func() bool { return strings.Contains(value(win.GetDlgItem(hwnd, idState)), "端口必须为数字") })
	if m.Snapshot().Config.Port == 0 {
		t.Fatal("无效端口被保存")
	}
	setText(win.GetDlgItem(hwnd, idPort), "3080")
	setText(win.GetDlgItem(hwnd, idDirectory), "missing-folder")
	win.SendMessage(hwnd, win.WM_COMMAND, idStart, 0)
	waitFor(t, func() bool { return strings.Contains(m.Snapshot().Error, "工作目录必须是绝对路径") })
	if m.Snapshot().Running {
		t.Fatal("无效目录仍启动")
	}
	win.SendMessage(hwnd, win.WM_ENDSESSION, 1, 0)
	if m.Snapshot().Running {
		t.Fatal("注销未停止")
	}
}
func desktopManager(t *testing.T) *manager.Manager {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "versions", "1.2.3", "node_modules", "@deepseek-ai", "dsh")
	os.MkdirAll(filepath.Join(dir, "lib"), 0700)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"@deepseek-ai/dsh","version":"1.2.3","type":"module"}`), 0600)
	os.WriteFile(filepath.Join(dir, "lib", "bin.js"), []byte(`import http from 'node:http';const s=http.createServer((q,r)=>r.end('ok')).listen(Number(process.argv[process.argv.indexOf('--port')+1]),'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`), 0600)
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	store := settings.Store{Root: root}
	store.SaveVersions(settings.Versions{Current: "1.2.3"})
	store.SaveConfig(settings.Config{Port: port, Directory: t.TempDir()})
	m, e := manager.New(root)
	if e != nil {
		t.Fatal(e)
	}
	return m
}
func TestNativeWindowSettingsAndServiceActions(t *testing.T) {
	m := desktopManager(t)
	defer m.Stop()
	done := make(chan error, 1)
	go func() { done <- Run(m, true) }()
	var hwnd win.HWND
	waitFor(t, func() bool {
		hwnd = win.FindWindow(text(className), nil)
		return hwnd != 0 && win.GetDlgItem(hwnd, idLog) != 0
	})
	defer func() {
		win.PostMessage(hwnd, win.WM_CLOSE, 0, 0)
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			t.Error("窗口未退出")
		}
	}()
	command := func(id int) { win.SendMessage(hwnd, win.WM_COMMAND, uintptr(id), 0) }
	win.SendMessage(hwnd, wmRefresh, 0, 0)
	if got := value(win.GetDlgItem(hwnd, idPort)); got != fmt.Sprint(m.Snapshot().Config.Port) {
		t.Fatalf("端口显示 %q", got)
	}
	command(idSave)
	command(idStart)
	waitFor(t, func() bool { return m.Snapshot().Running })
	waitFor(t, func() bool { return !win.IsWindowEnabled(win.GetDlgItem(hwnd, idStart)) })
	if !win.IsWindowEnabled(win.GetDlgItem(hwnd, idStop)) {
		t.Fatal("运行中不能停止")
	}
	command(idRestart)
	waitFor(t, func() bool { return m.Snapshot().Running && !m.Snapshot().Busy })
	command(idStop)
	waitFor(t, func() bool { return m.Snapshot().Status == "已停止" })
	m.Write([]byte("中文日志\nsecond line\n"))
	waitFor(t, func() bool {
		return strings.HasSuffix(value(win.GetDlgItem(hwnd, idLog)), "中文日志\r\nsecond line\r\n")
	})
	win.SetWindowPos(hwnd, 0, 0, 0, 860, 640, win.SWP_NOMOVE|win.SWP_NOZORDER)
	var r win.RECT
	win.GetClientRect(win.GetDlgItem(hwnd, idLog), &r)
	if r.Right < 100 || r.Bottom < 30 {
		t.Fatal("日志布局不可见")
	}
	if result := win.SendMessage(hwnd, win.WM_QUERYENDSESSION, 0, 0); result != 1 {
		t.Fatal("拒绝系统注销")
	}
	// 重复启动只激活同一个窗口，随后恢复测试的隐藏状态。
	if e := Run(m, true); e != nil {
		t.Fatal(e)
	}
	win.ShowWindow(hwnd, win.SW_HIDE)
	if second := win.FindWindow(text(className), nil); second != hwnd {
		t.Fatal("重复实例创建了新窗口")
	}
}
