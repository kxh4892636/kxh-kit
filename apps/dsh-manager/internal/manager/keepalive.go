package manager

import (
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/process"
	"net/http"
	"net/http/cookiejar"
	"time"
)

type Clock interface {
	Now() time.Time
	After(time.Duration) <-chan time.Time
}
type wallClock struct{}

func (wallClock) Now() time.Time                         { return time.Now() }
func (wallClock) After(d time.Duration) <-chan time.Time { return time.After(d) }

// 调用方持有 op；意图和运行版本不变，恢复不能消费待应用版本。
func (m *Manager) scheduleRecovery(intent uint64) {
	m.mu.Lock()
	if !m.wanted || !m.config.KeepAlive || m.intent != intent {
		m.mu.Unlock()
		return
	}
	seconds := []int{1, 2, 4, 8, 16, 30}[min(m.failures, 5)]
	m.failures++
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.retrySeconds = seconds
	m.busy = false
	m.status = fmt.Sprintf("异常退出 · %d 秒后重启", seconds)
	m.signal()
	m.mu.Unlock()
	go func() {
		defer cancel()
		select {
		case <-ctx.Done():
			return
		case <-m.clock.After(time.Duration(seconds) * time.Second):
		}
		m.op.Lock()
		defer m.op.Unlock()
		m.mu.Lock()
		valid := m.intent == intent && m.wanted && m.config.KeepAlive
		c := m.config
		v := m.versions.Current
		m.mu.Unlock()
		if !valid || ctx.Err() != nil {
			return
		}
		m.state("正在恢复服务", true, nil)
		if err := m.start(ctx, c, v); err != nil {
			m.state("恢复失败", false, err)
			fmt.Fprintln(m, err)
			m.scheduleRecovery(intent)
		}
	}()
}
func (m *Manager) health(p *process.Process) {
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true}}
	for {
		select {
		case <-p.Done():
			return
		case <-m.clock.After(30 * time.Second):
		}
		m.mu.Lock()
		if m.proc != p {
			m.mu.Unlock()
			return
		}
		address := m.address
		m.mu.Unlock()
		response, err := client.Get(address)
		healthy := false
		if err == nil {
			healthy = response.StatusCode >= 200 && response.StatusCode < 400
			response.Body.Close()
		}
		m.mu.Lock()
		if m.proc == p && !m.busy {
			status := "运行中"
			if !healthy {
				status = "运行中 · HTTP 暂不可达"
			}
			if m.status != status {
				m.status = status
				m.signal()
			}
		}
		m.mu.Unlock()
	}
}
