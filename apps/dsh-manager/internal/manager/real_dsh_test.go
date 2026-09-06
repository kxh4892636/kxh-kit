package manager_test

import (
	"kxh.dev/dsh-manager/internal/manager"
	"kxh.dev/dsh-manager/internal/process"
	"kxh.dev/dsh-manager/internal/settings"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRealDSHInstallationAndLifecycle(t *testing.T) {
	root := os.Getenv("DSH_SMOKE_ROOT")
	if root == "" {
		t.Skip("设置 DSH_SMOKE_ROOT 后执行联网安装与真实 DSH 冒烟")
	}
	profile := filepath.Join(root, "smoke-profile")
	t.Setenv("DSH_HOME", profile)
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	work := filepath.Join(root, "中文 smoke workspace")
	if e = os.MkdirAll(work, 0700); e != nil {
		t.Fatal(e)
	}
	m, e := manager.New(root)
	if e != nil {
		t.Fatal(e)
	}
	defer m.Stop()
	if e = m.Save(settings.Config{Port: port, Directory: work}); e != nil {
		t.Fatal(e)
	}
	done := make(chan error, 1)
	go func() { done <- m.Start() }()
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
	for {
		select {
		case e = <-done:
			if e != nil {
				t.Fatalf("%v\n%s", e, m.Snapshot().Log)
			}
			s := m.Snapshot()
			if !s.Running || s.Version == "" {
				t.Fatal("真实服务未运行")
			}
			jar, _ := cookiejar.New(nil)
			client := &http.Client{Jar: jar, Timeout: 10 * time.Second}
			response, err := client.Get(s.Address)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if response.StatusCode != 200 {
				t.Fatal(response.StatusCode)
			}
			t.Logf("DSH=%s port=%d status=%d", s.Version, port, response.StatusCode)
			m.Stop()
			if err = process.CheckPort(port); err != nil {
				t.Fatal(err)
			}
			t.Log("停止完成，端口已释放")
			return
		case <-tick.C:
			t.Log(m.Snapshot().Status)
		}
	}
}
