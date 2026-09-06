package manager_test

import (
	"fmt"
	"kxh.dev/dsh-manager/internal/manager"
	"kxh.dev/dsh-manager/internal/releases"
	"kxh.dev/dsh-manager/internal/settings"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func addVersion(t *testing.T, root, v, script string) {
	t.Helper()
	base := filepath.Join(root, "versions", v)
	dir := filepath.Join(base, "node_modules", "@deepseek-ai", "dsh")
	if err := os.MkdirAll(filepath.Join(dir, "lib"), 0700); err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string]string{
		filepath.Join(base, ".dsh-manager-owned"): v,
		filepath.Join(dir, "package.json"):        fmt.Sprintf(`{"name":"@deepseek-ai/dsh","version":%q,"type":"module"}`, v),
		filepath.Join(dir, "lib", "bin.js"):       script,
	} {
		if err := os.WriteFile(name, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func updateFixture(t *testing.T, clock manager.Clock, handler http.HandlerFunc) (*manager.Manager, settings.Store) {
	t.Helper()
	root := t.TempDir()
	addVersion(t, root, "1.2.3", recoverableServer)
	addVersion(t, root, "2.0.0", server)
	store := settings.Store{Root: root}
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	if err = store.SaveConfig(settings.Config{Port: port, Directory: root, KeepAlive: true, AutoUpdate: true}); err != nil {
		t.Fatal(err)
	}
	if err = store.SaveVersions(settings.Versions{Current: "1.2.3"}); err != nil {
		t.Fatal(err)
	}
	source := httptest.NewServer(handler)
	t.Cleanup(source.Close)
	repo := releases.New(root)
	repo.URL = source.URL
	m, err := manager.NewWithRepository(root, clock, repo)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(m.Close)
	return m, store
}
func latest2(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, `{"name":"@deepseek-ai/dsh","version":"2.0.0"}`)
}

func TestPreparedUpdateKeepsServiceAndRecoveryVersion(t *testing.T) {
	clock := newClock()
	m, store := updateFixture(t, clock, latest2)
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	if err := m.CheckUpdate(false); err != nil {
		t.Fatal(err)
	}
	if s := m.Snapshot(); !s.Running || s.Version != "1.2.3" || s.Pending != "2.0.0" {
		t.Fatal(s)
	}
	request(t, m.Snapshot().Address+"crash")
	awaitState(t, m, func(s manager.Snapshot) bool { return s.RetrySeconds == 1 })
	clock.fire(t, time.Second)
	awaitState(t, m, func(s manager.Snapshot) bool { return s.Running })
	if s := m.Snapshot(); s.Version != "1.2.3" || s.Pending != "2.0.0" {
		t.Fatal("保活应用更新", s)
	}
	m.Stop()
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	v, err := store.LoadVersions()
	if err != nil || v.Current != "2.0.0" || v.Previous != "1.2.3" || v.Pending != "" {
		t.Fatal(v, err)
	}
	if err = m.CheckUpdate(true); err != nil || !strings.Contains(m.Snapshot().UpdateStatus, "最新") {
		t.Fatal(err, m.Snapshot())
	}
}

func TestFailedUpdateRollsBackAndManualCheckAllowsRetry(t *testing.T) {
	m, store := updateFixture(t, nil, latest2)
	addVersion(t, store.Root, "2.0.0", "process.exit(9)")
	if err := m.CheckUpdate(false); err != nil {
		t.Fatal(err)
	}
	if err := m.Start(); err != nil {
		t.Fatal("旧版回退失败", err)
	}
	v, _ := store.LoadVersions()
	if v.Current != "1.2.3" || v.Failed != "2.0.0" || v.Pending != "" || !m.Snapshot().Running {
		t.Fatal(v, m.Snapshot())
	}
	if err := m.CheckUpdate(false); err != nil || !strings.Contains(m.Snapshot().UpdateStatus, "跳过") {
		t.Fatal(err)
	}
	addVersion(t, store.Root, "2.0.0", server)
	if err := m.CheckUpdate(true); err != nil {
		t.Fatal(err)
	}
	if err := m.Restart(); err != nil {
		t.Fatal(err)
	}
	if m.Snapshot().Version != "2.0.0" {
		t.Fatal(m.Snapshot())
	}
}

func TestUpdateRestartCannotOverrideLaterStop(t *testing.T) {
	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	m, _ := updateFixture(t, nil, func(w http.ResponseWriter, r *http.Request) {
		entered <- struct{}{}
		select {
		case <-release:
			latest2(w, r)
		case <-r.Context().Done():
		}
	})
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	m.RequestUpdate(true)
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("未检查")
	}
	if err := m.CheckUpdate(true); err == nil {
		t.Fatal("并发安装未拒绝")
	}
	m.Stop()
	close(release)
	awaitState(t, m, func(s manager.Snapshot) bool { return !s.Updating && s.Pending == "2.0.0" })
	time.Sleep(50 * time.Millisecond)
	if s := m.Snapshot(); s.Running || s.Status != "已停止" {
		t.Fatal("下载后覆盖停止", s)
	}
}

func TestAutomaticScheduleCanBeDisabledAndCloseCancelsNetwork(t *testing.T) {
	var calls atomic.Int32
	clock := newClock()
	m, _ := updateFixture(t, clock, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); latest2(w, r) })
	m.Background()
	m.Background()
	awaitState(t, m, func(s manager.Snapshot) bool { return s.Pending == "2.0.0" && !s.Updating })
	clock.fire(t, 6*time.Hour)
	awaitState(t, m, func(s manager.Snapshot) bool { return calls.Load() == 2 && !s.Updating })
	if err := m.SetOptions(true, false, false); err != nil {
		t.Fatal(err)
	}
	clock.fire(t, 6*time.Hour)
	time.Sleep(30 * time.Millisecond)
	if calls.Load() != 2 {
		t.Fatal("关闭后仍自动检查")
	}
	if err := m.CheckUpdate(false); err == nil {
		t.Fatal("自动关闭未生效")
	}
	if err := m.CheckUpdate(true); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 3 {
		t.Fatal("手动检查受自动开关影响")
	}
	m.Close()
	m.Background()
	if err := m.CheckUpdate(true); err == nil {
		t.Fatal("退出后仍检查")
	}

	entered := make(chan struct{}, 1)
	blocked, _ := updateFixture(t, nil, func(w http.ResponseWriter, r *http.Request) { entered <- struct{}{}; <-r.Context().Done() })
	blocked.Background()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("未检查")
	}
	done := make(chan struct{})
	go func() { blocked.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("退出未取消网络")
	}
}

func TestManualUpdateRestartsAndFailuresAreVisible(t *testing.T) {
	m, _ := updateFixture(t, nil, latest2)
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	m.RequestUpdate(true)
	awaitState(t, m, func(s manager.Snapshot) bool { return s.Running && s.Version == "2.0.0" })
	bad, _ := updateFixture(t, nil, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })
	if err := bad.CheckUpdate(true); err == nil || !strings.Contains(bad.Snapshot().UpdateStatus, "503") {
		t.Fatal(err, bad.Snapshot())
	}
	bad.RequestUpdate(true)
	awaitState(t, bad, func(s manager.Snapshot) bool { return !s.Updating && strings.Contains(s.UpdateStatus, "503") })
}

func TestFailedManualUpdateDoesNotCancelCrashRecovery(t *testing.T) {
	clock := newClock()
	calls := make(chan struct{}, 1)
	m, _ := updateFixture(t, clock, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503); calls <- struct{}{} })
	if err := m.Start(); err != nil {
		t.Fatal(err)
	}
	request(t, m.Snapshot().Address+"crash")
	awaitState(t, m, func(s manager.Snapshot) bool { return s.RetrySeconds == 1 })
	m.RequestUpdate(true)
	select {
	case <-calls:
	case <-time.After(time.Second):
		t.Fatal("未检查")
	}
	awaitState(t, m, func(s manager.Snapshot) bool { return !s.Updating && strings.Contains(s.UpdateStatus, "503") })
	clock.fire(t, time.Second)
	awaitState(t, m, func(s manager.Snapshot) bool { return s.Running })
	if m.Snapshot().Version != "1.2.3" {
		t.Fatal("恢复改变版本")
	}
}

func TestCanceledCandidateRemainsPending(t *testing.T) {
	m, store := updateFixture(t, nil, latest2)
	addVersion(t, store.Root, "2.0.0", "setInterval(()=>{},1000)")
	if err := m.CheckUpdate(true); err != nil {
		t.Fatal(err)
	}
	m.Request("start")
	awaitState(t, m, func(s manager.Snapshot) bool { return s.Status == "正在启动 DSH" })
	m.Stop()
	v, _ := store.LoadVersions()
	if v.Pending != "2.0.0" || v.Failed != "" || m.Snapshot().Running {
		t.Fatal(v, m.Snapshot())
	}
}
