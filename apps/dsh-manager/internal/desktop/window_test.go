package desktop

import (
	"fmt"
	"github.com/lxn/win"

	"kxh.dev/dsh-manager/internal/manager"
	"kxh.dev/dsh-manager/internal/settings"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unsafe"
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
	defer func() { win.PostMessage(hwnd, win.WM_COMMAND, idExit, 0); <-done }()
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
	return desktopManagerLogin(t, false)
}
func desktopManagerLogin(t *testing.T, login bool) *manager.Manager {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "versions", "1.2.3", "node_modules", "@deepseek-ai", "dsh")
	os.MkdirAll(filepath.Join(dir, "lib"), 0700)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"@deepseek-ai/dsh","version":"1.2.3","type":"module"}`), 0600)
	os.WriteFile(filepath.Join(dir, "lib", "bin.js"), []byte(`import http from 'node:http';const s=http.createServer((q,r)=>{r.end('ok');if(q.url==='/crash')setTimeout(()=>process.exit(8),10)}).listen(Number(process.argv[process.argv.indexOf('--port')+1]),'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`), 0600)
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	store := settings.Store{Root: root}
	store.SaveVersions(settings.Versions{Current: "1.2.3"})
	store.SaveConfig(settings.Config{Port: port, Directory: t.TempDir(), Login: login})
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
		win.PostMessage(hwnd, win.WM_COMMAND, idExit, 0)
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
	win.SendMessage(win.GetDlgItem(hwnd, idAutoUpdate), win.BM_SETCHECK, win.BST_CHECKED, 0)
	command(idAutoUpdate)
	waitFor(t, func() bool { return m.Snapshot().Config.AutoUpdate && !m.Snapshot().OptionsBusy })
	win.SendMessage(win.GetDlgItem(hwnd, idAutoUpdate), win.BM_SETCHECK, win.BST_UNCHECKED, 0)
	command(idAutoUpdate)
	waitFor(t, func() bool { return !m.Snapshot().Config.AutoUpdate && !m.Snapshot().OptionsBusy })
	command(idStart)
	waitFor(t, func() bool { return m.Snapshot().Running })
	waitFor(t, func() bool { return !win.IsWindowEnabled(win.GetDlgItem(hwnd, idStart)) })
	if !win.IsWindowEnabled(win.GetDlgItem(hwnd, idStop)) {
		t.Fatal("运行中不能停止")
	}
	win.SendMessage(hwnd, wmTray, 1, win.WM_LBUTTONDBLCLK)
	if !win.IsWindowVisible(hwnd) {
		t.Fatal("托盘无法恢复窗口")
	}
	win.SendMessage(hwnd, win.WM_CLOSE, 0, 0)
	if win.IsWindowVisible(hwnd) || !m.Snapshot().Running {
		t.Fatal("关闭窗口没有入托盘继续运行")
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
	var limits win.MINMAXINFO
	win.SendMessage(hwnd, win.WM_GETMINMAXINFO, 0, uintptr(unsafe.Pointer(&limits)))
	if limits.PtMinTrackSize.X < 760 || limits.PtMinTrackSize.Y < 600 {
		t.Fatal("最小窗口会裁切控件")
	}
	win.SendMessage(hwnd, win.WM_SIZE, sizeMinimized, 0)
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

func TestBackgroundLoginLaunchAndKeepAlivePreference(t *testing.T) {
	m := desktopManagerLogin(t, true)
	done := make(chan error, 1)
	go func() { done <- Run(m, true) }()
	var hwnd win.HWND
	waitFor(t, func() bool { hwnd = win.FindWindow(text(className), nil); return hwnd != 0 && m.Snapshot().Running })
	defer func() { win.PostMessage(hwnd, win.WM_COMMAND, idExit, 0); <-done }()
	if win.IsWindowVisible(hwnd) {
		t.Fatal("登录启动未进入后台")
	}
	if win.SendMessage(win.GetDlgItem(hwnd, idLogin), win.BM_GETCHECK, 0, 0) != win.BST_CHECKED {
		t.Fatal("登录状态显示错误")
	}
	// 只切换保活，登录配置保持原值，测试不写正式用户 Run 键。
	win.SendMessage(win.GetDlgItem(hwnd, idKeepAlive), win.BM_SETCHECK, win.BST_CHECKED, 0)
	win.SendMessage(hwnd, win.WM_COMMAND, idKeepAlive, 0)
	waitFor(t, func() bool { return m.Snapshot().Config.KeepAlive })
}

func TestStopButtonCancelsTrayRecovery(t *testing.T) {
	m := desktopManager(t)
	if e := m.SetOptions(true, false); e != nil {
		t.Fatal(e)
	}
	done := make(chan error, 1)
	go func() { done <- Run(m, true) }()
	var hwnd win.HWND
	waitFor(t, func() bool {
		hwnd = win.FindWindow(text(className), nil)
		return hwnd != 0 && win.GetDlgItem(hwnd, idLog) != 0
	})
	defer func() { win.PostMessage(hwnd, win.WM_COMMAND, idExit, 0); <-done }()
	win.SendMessage(hwnd, win.WM_COMMAND, idStart, 0)
	waitFor(t, func() bool { return m.Snapshot().Running })
	response, e := http.Get(m.Snapshot().Address + "crash")
	if e != nil {
		t.Fatal(e)
	}
	response.Body.Close()
	waitFor(t, func() bool { return m.Snapshot().RetrySeconds > 0 })
	win.SendMessage(hwnd, wmRefresh, 0, 0)
	if !win.IsWindowEnabled(win.GetDlgItem(hwnd, idStop)) {
		t.Fatal("退避期间无法停止")
	}
	win.SendMessage(hwnd, win.WM_COMMAND, idStop, 0)
	waitFor(t, func() bool { return m.Snapshot().Status == "已停止" })
	time.Sleep(1100 * time.Millisecond)
	if m.Snapshot().Running {
		t.Fatal("停止后仍自动重启")
	}
}
func TestFailedOptionSaveRestoresCheckbox(t *testing.T) {
	m := desktopManager(t)
	done := make(chan error, 1)
	go func() { done <- Run(m, true) }()
	var hwnd win.HWND
	waitFor(t, func() bool {
		hwnd = win.FindWindow(text(className), nil)
		return hwnd != 0 && win.GetDlgItem(hwnd, idLog) != 0
	})
	defer func() { win.PostMessage(hwnd, win.WM_COMMAND, idExit, 0); <-done }()
	if e := os.Remove(m.Snapshot().Config.Directory); e != nil {
		t.Fatal(e)
	}
	win.SendMessage(win.GetDlgItem(hwnd, idKeepAlive), win.BM_SETCHECK, win.BST_CHECKED, 0)
	win.SendMessage(hwnd, win.WM_COMMAND, idKeepAlive, 0)
	waitFor(t, func() bool { return !m.Snapshot().OptionsBusy && m.Snapshot().Error != "" })
	win.SendMessage(hwnd, wmRefresh, 0, 0)
	if win.SendMessage(win.GetDlgItem(hwnd, idKeepAlive), win.BM_GETCHECK, 0, 0) != win.BST_UNCHECKED {
		t.Fatal("失败后未恢复持久配置")
	}
}
