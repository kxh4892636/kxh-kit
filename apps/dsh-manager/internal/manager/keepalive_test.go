package manager_test

import (
	"kxh.dev/dsh-manager/internal/manager"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeClock struct {
	mu     sync.Mutex
	now    time.Time
	timers map[time.Duration][]chan time.Time
}

func newClock() *fakeClock {
	return &fakeClock{now: time.Date(2026, 9, 6, 0, 0, 0, 0, time.UTC), timers: make(map[time.Duration][]chan time.Time)}
}
func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *fakeClock) After(d time.Duration) <-chan time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := make(chan time.Time, 1)
	c.timers[d] = append(c.timers[d], ch)
	return ch
}
func (c *fakeClock) advance(d time.Duration) { c.mu.Lock(); c.now = c.now.Add(d); c.mu.Unlock() }
func (c *fakeClock) fire(t *testing.T, d time.Duration) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		channels := c.timers[d]
		delete(c.timers, d)
		c.mu.Unlock()
		if len(channels) > 0 {
			c.advance(d)
			for _, ch := range channels {
				ch <- c.Now()
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("没有登记 %v 定时器", d)
}
func awaitState(t *testing.T, m *manager.Manager, check func(manager.Snapshot) bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if check(m.Snapshot()) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("状态未到达：%+v", m.Snapshot())
}

const recoverableServer = `import http from 'node:http';
let healthy=true;
const port=Number(process.argv[process.argv.indexOf('--port')+1]);
const s=http.createServer((q,r)=>{
 if(q.url==='/crash'){r.end('bye');setTimeout(()=>process.exit(7),10);return}
 if(q.url==='/unhealthy'){healthy=false;r.end('ok');return}
 if(!healthy)r.writeHead(503);r.end('ok');
}).listen(port,'127.0.0.1');
process.on('SIGTERM',()=>s.close(()=>process.exit(0)));
`

func request(t *testing.T, address string) {
	t.Helper()
	r, e := http.Get(address)
	if e != nil {
		t.Fatal(e)
	}
	r.Body.Close()
}
func TestCrashBackoffCapsAndStableRunResets(t *testing.T) {
	clock := newClock()
	m, _ := fixtureClock(t, recoverableServer, clock)
	if e := m.SetOptions(true, false); e != nil {
		t.Fatal(e)
	}
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	for _, seconds := range []int{1, 2, 4, 8, 16, 30, 30} {
		request(t, m.Snapshot().Address+"crash")
		awaitState(t, m, func(s manager.Snapshot) bool { return s.RetrySeconds == seconds && !s.Running })
		clock.fire(t, time.Duration(seconds)*time.Second)
		awaitState(t, m, func(s manager.Snapshot) bool { return s.Running && !s.Busy })
	}
	clock.advance(61 * time.Second)
	request(t, m.Snapshot().Address+"crash")
	awaitState(t, m, func(s manager.Snapshot) bool { return s.RetrySeconds == 1 })
	if e := m.SetOptions(false, false); e != nil {
		t.Fatal(e)
	}
	clock.fire(t, time.Second)
	time.Sleep(50 * time.Millisecond)
	if s := m.Snapshot(); s.Running || s.RetrySeconds != 0 {
		t.Fatal("关闭保活后仍恢复")
	}
}
func TestHTTPFailureDoesNotKillLiveProcess(t *testing.T) {
	clock := newClock()
	m, _ := fixtureClock(t, recoverableServer, clock)
	if e := m.SetOptions(true, false); e != nil {
		t.Fatal(e)
	}
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	request(t, m.Snapshot().Address+"unhealthy")
	clock.fire(t, 30*time.Second)
	awaitState(t, m, func(s manager.Snapshot) bool { return strings.Contains(s.Status, "HTTP 暂不可达") })
	if !m.Snapshot().Running || m.Snapshot().RetrySeconds != 0 {
		t.Fatal("HTTP失败触发了进程重启")
	}
	m.Stop()
	clock.fire(t, 30*time.Second)
	if m.Snapshot().Running {
		t.Fatal("主动停止后复活")
	}
}
func TestStopCancelsPendingRecovery(t *testing.T) {
	clock := newClock()
	m, _ := fixtureClock(t, recoverableServer, clock)
	if e := m.SetOptions(true, false); e != nil {
		t.Fatal(e)
	}
	if e := m.Start(); e != nil {
		t.Fatal(e)
	}
	request(t, m.Snapshot().Address+"crash")
	awaitState(t, m, func(s manager.Snapshot) bool { return s.RetrySeconds == 1 })
	m.Stop()
	clock.fire(t, time.Second)
	if m.Snapshot().Running || m.Snapshot().Status != "已停止" {
		t.Fatal("停止未取消恢复")
	}
}

func TestLastOptionRequestWinsAndFailureKeepsSavedOptions(t *testing.T) {
	m, _ := fixture(t, recoverableServer)
	for i := 0; i < 10; i++ {
		m.RequestOptions(true, false)
		m.RequestOptions(false, false)
	}
	awaitState(t, m, func(s manager.Snapshot) bool { return !s.OptionsBusy })
	if m.Snapshot().Config.KeepAlive {
		t.Fatal("快速关闭被旧请求覆盖")
	}
}
