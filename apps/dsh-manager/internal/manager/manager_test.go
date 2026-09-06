package manager_test

import (
	"fmt"
	"kxh.dev/dsh-manager/internal/manager"
	"kxh.dev/dsh-manager/internal/settings"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T, script string) (*manager.Manager, int) {
	return fixtureClock(t, script, nil)
}
func fixtureClock(t *testing.T, script string, clock manager.Clock) (*manager.Manager, int) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "versions", "1.2.3", "node_modules", "@deepseek-ai", "dsh")
	os.MkdirAll(filepath.Join(dir, "lib"), 0700)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"@deepseek-ai/dsh","version":"1.2.3","type":"module"}`), 0600)
	os.WriteFile(filepath.Join(dir, "lib", "bin.js"), []byte(script), 0600)
	s := settings.Store{Root: root}
	s.SaveVersions(settings.Versions{Current: "1.2.3"})
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	work := filepath.Join(t.TempDir(), "中文 space")
	os.Mkdir(work, 0700)
	s.SaveConfig(settings.Config{Port: port, Directory: work})
	m, e := manager.New(root)
	if clock != nil {
		m, e = manager.NewWithClock(root, clock)
	}
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(m.Stop)
	return m, port
}

const server = `import http from 'node:http';
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const server=http.createServer((q,r)=>r.end(process.cwd())).listen(port,'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
console.log('服务启动');
`

func TestStartStopAndPersistentConfiguration(t *testing.T) {
	m, port := fixture(t, server)
	c := m.Snapshot().Config
	if e := m.Save(c); e != nil {
		t.Fatal(e)
	}
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	if e := m.Start(); e != nil {
		t.Fatal("重复启动", e)
	}
	s := m.Snapshot()
	if !s.Running || s.Busy || s.Version != "1.2.3" {
		t.Fatalf("%+v", s)
	}
	if e := m.Save(c); e == nil {
		t.Fatal("运行中修改配置")
	}
	r, e := http.Get(fmt.Sprintf("http://127.0.0.1:%d/", port))
	if e != nil {
		t.Fatal(e)
	}
	r.Body.Close()
	m.Stop()
	if m.Snapshot().Running || m.Snapshot().Status != "已停止" {
		t.Fatal(m.Snapshot())
	}
	if e = m.Save(c); e != nil {
		t.Fatal(e)
	}
}
func TestPortConflictNeverBecomesRunning(t *testing.T) {
	m, port := fixture(t, server)
	l, e := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	if e = m.Start(); e == nil || !strings.Contains(e.Error(), "端口") {
		t.Fatal(e)
	}
	if m.Snapshot().Running {
		t.Fatal("错误标记运行")
	}
}
func TestExitAndCancellationAreObservable(t *testing.T) {
	m, _ := fixture(t, "setTimeout(()=>process.exit(9),20)")
	if e := m.Start(); e == nil {
		t.Fatal("启动失败未报告")
	}
	slow, _ := fixture(t, "setInterval(()=>{},1000)")
	done := make(chan error, 1)
	go func() { done <- slow.Start() }()
	deadline := time.Now().Add(5 * time.Second)
	for !slow.Snapshot().Busy && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if e := slow.Save(slow.Snapshot().Config); e == nil {
		t.Fatal("准备期间修改配置")
	}
	slow.Stop()
	select {
	case e := <-done:
		if e == nil {
			t.Fatal("未取消")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("停止未结束启动")
	}
}
func TestLogsAreBoundedAndChangesAreCoalesced(t *testing.T) {
	m, e := manager.New(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	m.Write([]byte(strings.Repeat("汉", 20000)))
	m.Write([]byte("tail"))
	s := m.Snapshot()
	if len(s.Log) > 24000 || !strings.HasSuffix(s.Log, "tail") {
		t.Fatal("日志无界")
	}
	select {
	case <-m.Changes():
	default:
		t.Fatal("无变更通知")
	}
	select {
	case <-m.Changes():
		t.Fatal("未合并通知")
	default:
	}
	c := s.Config
	c.Port = -1
	if e = m.Save(c); e == nil {
		t.Fatal("无效配置")
	}
}
func TestCorruptPersistentStateIsNotOverwritten(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "versions.json"), []byte(`{"current":"../x"}`), 0600)
	if _, e := manager.New(root); e == nil {
		t.Fatal("无效版本记录被接受")
	}
	os.WriteFile(filepath.Join(root, "versions.json"), []byte("{"), 0600)
	if _, e := manager.New(root); e == nil {
		t.Fatal("损坏版本记录被接受")
	}
	os.WriteFile(filepath.Join(root, "config.json"), []byte("{"), 0600)
	if _, e := manager.New(root); e == nil {
		t.Fatal("损坏配置被接受")
	}
}

func TestExplicitStopCancelsRestart(t *testing.T) {
	slow := strings.Replace(server, "server.close(()=>process.exit(0))", "setTimeout(()=>server.close(()=>process.exit(0)),250)", 1)
	m, _ := fixture(t, slow)
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	done := make(chan error, 1)
	go func() { done <- m.Restart() }()
	deadline := time.Now().Add(5 * time.Second)
	for m.Snapshot().Status != "正在重启" && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if m.Snapshot().Status != "正在重启" {
		t.Fatal("没有进入重启事务")
	}
	m.Stop()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("重启未取消")
	}
	time.Sleep(100 * time.Millisecond)
	if s := m.Snapshot(); s.Running || s.Status != "已停止" {
		t.Fatalf("停止后又复活：%+v", s)
	}
}

func TestAuthenticatedLaunchAddressAndRedactedLogs(t *testing.T) {
	script := `import http from 'node:http';
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const s=http.createServer((q,r)=>{
 if(q.url==='/?token=test-private'){r.writeHead(302,{'set-cookie':'session=ok; Path=/','location':'/'});return r.end()}
 if(q.headers.cookie==='session=ok')return r.end('authorized');
 r.writeHead(401);r.end();
}).listen(port,'127.0.0.1',()=>{
 process.stdout.write('dsh web: http://127.0.0.1:'+port+'/?tok');
 setTimeout(()=>process.stdout.write('en=test-private\n'),10);
});
process.on('SIGTERM',()=>s.close(()=>process.exit(0)));
`
	m, port := fixture(t, script)
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	s := m.Snapshot()
	if s.Address != fmt.Sprintf("http://127.0.0.1:%d/?token=test-private", port) {
		t.Fatal("未保存认证启动地址")
	}
	if strings.Contains(s.Log, "test-private") || !strings.Contains(s.Log, "[已隐藏]") {
		t.Fatal("访问令牌泄漏到日志")
	}
}

func TestQueuedUserStopWinsOverStart(t *testing.T) {
	m, _ := fixture(t, server)
	m.Request("start")
	m.Request("stop")
	deadline := time.Now().Add(5 * time.Second)
	for m.Snapshot().Busy && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if s := m.Snapshot(); s.Busy || s.Running || s.Status != "已停止" {
		t.Fatalf("后来的停止未生效：%+v", s)
	}
}
