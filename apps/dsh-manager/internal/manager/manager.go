package manager

import (
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/process"
	"kxh.dev/dsh-manager/internal/releases"
	"kxh.dev/dsh-manager/internal/runtime"
	"kxh.dev/dsh-manager/internal/settings"
	"strings"
	"sync"
	"time"
)

type Snapshot struct {
	Config  settings.Config
	Status  string
	Version string
	Error   string
	Log     string
	Busy    bool
	Running bool
	Address string
}
type Manager struct {
	mu       sync.Mutex
	op       sync.Mutex
	store    settings.Store
	repo     *releases.Repository
	config   settings.Config
	versions settings.Versions
	status   string
	problem  string
	log      string
	busy     bool
	proc     *process.Process
	cancel   context.CancelFunc
	intent   uint64
	address  string
	changes  chan struct{}
}

func New(root string) (*Manager, error) {
	s := settings.Store{Root: root}
	c, err := s.LoadConfig()
	if err != nil {
		return nil, err
	}
	v, err := s.LoadVersions()
	if err != nil {
		return nil, err
	}
	if v.Current != "" && !releases.ValidVersion(v.Current) {
		return nil, fmt.Errorf("版本记录无效")
	}
	return &Manager{store: s, repo: releases.New(root), config: c, versions: v, status: "已停止", changes: make(chan struct{}, 1)}, nil
}
func (m *Manager) Changes() <-chan struct{} { return m.changes }
func (m *Manager) ReportError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.problem = err.Error()
	m.signal()
}
func (m *Manager) signal() {
	select {
	case m.changes <- struct{}{}:
	default:
	}
}
func (m *Manager) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Snapshot{Config: m.config, Status: m.status, Version: m.versions.Current, Error: m.problem, Log: m.log, Busy: m.busy, Running: m.proc != nil, Address: m.address}
}
func (m *Manager) Save(c settings.Config) error {
	if !m.op.TryLock() {
		return fmt.Errorf("正在执行操作，请稍后保存")
	}
	defer m.op.Unlock()
	m.mu.Lock()
	running := m.proc != nil || m.busy
	m.mu.Unlock()
	if running {
		return fmt.Errorf("请先停止服务再修改配置")
	}
	if err := m.store.SaveConfig(c); err != nil {
		return err
	}
	m.mu.Lock()
	m.config = c
	m.signal()
	m.mu.Unlock()
	return nil
}
func (m *Manager) Write(b []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	const max = 24000
	part := string(b)
	if len(part) > max {
		part = part[len(part)-max:]
	}
	m.log += strings.ToValidUTF8(part, "")
	if len(m.log) > max {
		m.log = strings.ToValidUTF8(m.log[len(m.log)-max:], "")
	}
	m.signal()
	return len(b), nil
}
func (m *Manager) state(status string, busy bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status = status
	m.busy = busy
	m.problem = ""
	if err != nil {
		m.problem = err.Error()
	}
	m.signal()
}
func (m *Manager) Start() error {
	return m.launchAction(false, m.claim(false))
}
func (m *Manager) Restart() error {
	return m.launchAction(true, m.claim(true))
}

// UI 请求在返回前登记顺序，后台 goroutine 的调度不能反转用户点击的先后。
func (m *Manager) Request(action string) {
	if action != "start" && action != "restart" && action != "stop" {
		return
	}
	intent := m.claim(action != "start")
	if action == "stop" {
		go m.stopIntent(intent)
	} else {
		go m.launchAction(action == "restart", intent)
	}
}
func (m *Manager) claim(cancelCurrent bool) uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.intent++
	if cancelCurrent && m.cancel != nil {
		m.cancel()
	}
	m.busy = true
	m.signal()
	return m.intent
}
func (m *Manager) launchAction(restart bool, intent uint64) error {
	m.op.Lock()
	defer m.op.Unlock()
	m.mu.Lock()
	if intent != m.intent {
		m.mu.Unlock()
		return context.Canceled
	}
	if m.proc != nil && !restart {
		m.busy = false
		m.signal()
		m.mu.Unlock()
		return nil
	}
	p := m.proc
	m.proc = nil
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	c := m.config
	v := m.versions.Current
	m.mu.Unlock()
	defer cancel()
	if p != nil {
		m.state("正在重启", true, nil)
		p.Stop(5 * time.Second)
	}
	m.state("正在准备", true, nil)
	err := m.start(ctx, c, v)
	if err != nil {
		m.state("启动失败", false, err)
		fmt.Fprintln(m, err)
	}
	return err
}
func (m *Manager) start(ctx context.Context, c settings.Config, v string) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if err := process.CheckPort(c.Port); err != nil {
		return err
	}
	n, err := runtime.Detect(ctx, c.Node)
	if err != nil {
		return err
	}
	if v == "" {
		m.state("正在下载并安装 DSH", true, nil)
		v, err = m.repo.Latest(ctx)
		if err != nil {
			return err
		}
		if _, err = m.repo.Install(ctx, n, v, m); err != nil {
			return err
		}
	}
	bin, err := m.repo.Bin(v)
	if err != nil {
		return fmt.Errorf("DSH 安装不可用：%w", err)
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	m.state("正在启动 DSH", true, nil)
	m.mu.Lock()
	m.address = fmt.Sprintf("http://127.0.0.1:%d/", c.Port)
	m.mu.Unlock()
	output := &serviceOutput{manager: m, port: c.Port}
	p, err := process.Start(process.Launch{Executable: n.Executable, Args: n.Args(bin, c.Port), Directory: c.Directory, Output: output})
	if err != nil {
		return err
	}
	ready, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	if err = p.ReadyAt(ready, c.Port, func() string { return m.Snapshot().Address }); err != nil {
		p.Stop(0)
		return err
	}
	versions := settings.Versions{Current: v}
	if err = m.store.SaveVersions(versions); err != nil {
		p.Stop(time.Second)
		return err
	}
	m.mu.Lock()
	m.proc = p
	m.versions = versions
	m.mu.Unlock()
	m.state("运行中", false, nil)
	go m.watch(p)
	return nil
}
func (m *Manager) watch(p *process.Process) {
	<-p.Done()
	m.op.Lock()
	defer m.op.Unlock()
	m.mu.Lock()
	if m.proc != p {
		m.mu.Unlock()
		return
	}
	m.proc = nil
	m.mu.Unlock()
	p.Stop(0)
	m.state("服务已退出", false, p.Err())
}
func (m *Manager) Stop() {
	m.stopIntent(m.claim(true))
}
func (m *Manager) stopIntent(intent uint64) {
	m.op.Lock()
	defer m.op.Unlock()
	m.mu.Lock()
	current := m.intent
	m.mu.Unlock()
	if current != intent {
		return
	}
	m.state("正在停止", true, nil)
	m.mu.Lock()
	p := m.proc
	m.proc = nil
	m.mu.Unlock()
	if p != nil {
		p.Stop(5 * time.Second)
	}
	m.state("已停止", false, nil)
}
