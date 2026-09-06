package manager

import (
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/runtime"
	"time"
)

// 确认单实例归属后启用后台检查，避免重复打开窗口启动另一个安装任务。
func (m *Manager) Background() {
	m.backgroundOnce.Do(func() {
		m.mu.Lock()
		if m.closed {
			m.mu.Unlock()
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		m.backgroundCancel = cancel
		m.mu.Unlock()
		go func() {
			for {
				if m.Snapshot().Config.AutoUpdate {
					_ = m.CheckUpdate(false)
				}
				select {
				case <-ctx.Done():
					return
				case <-m.clock.After(6 * time.Hour):
				}
			}
		}()
	})
}

func (m *Manager) Close() {
	m.mu.Lock()
	m.closed = true
	m.optionIntent++
	if m.backgroundCancel != nil {
		m.backgroundCancel()
	}
	if m.updateCancel != nil {
		m.updateCancel()
	}
	m.mu.Unlock()
	m.Stop()
	m.updateMu.Lock()
	m.updateMu.Unlock()
}

// 更新重启保留点击时的启动意图，下载期间发生的停止必须优先。
func (m *Manager) RequestUpdate(restart bool) {
	m.mu.Lock()
	intent := m.intent
	m.mu.Unlock()
	go func() {
		if err := m.CheckUpdate(true); err != nil {
			return
		}
		if restart {
			m.mu.Lock()
			valid := m.intent == intent && !m.closed
			if valid {
				m.intent++
				intent = m.intent
				if m.cancel != nil {
					m.cancel()
				}
				m.wanted = true
			}
			m.mu.Unlock()
			if valid {
				_ = m.launchAction(true, intent)
			}
		}
	}()
}

func (m *Manager) updateState(status string) {
	m.mu.Lock()
	m.updateStatus = status
	m.signal()
	m.mu.Unlock()
}

func (m *Manager) CheckUpdate(manual bool) (err error) {
	if !m.updateMu.TryLock() {
		return fmt.Errorf("正在检查或下载更新")
	}
	defer m.updateMu.Unlock()
	m.mu.Lock()
	if m.closed || (!manual && !m.config.AutoUpdate) {
		m.mu.Unlock()
		return context.Canceled
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.updateCancel = cancel
	m.updating = true
	node := m.config.Node
	m.mu.Unlock()
	defer func() {
		cancel()
		m.mu.Lock()
		m.updateCancel = nil
		m.updating = false
		m.updateVersion = ""
		if err != nil {
			m.updateStatus = "更新失败：" + err.Error()
		}
		m.signal()
		m.mu.Unlock()
	}()
	m.updateState("正在检查更新")
	latest, err := m.repo.Latest(ctx)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.latest = latest
	v := m.versions
	m.updateVersion = latest
	m.mu.Unlock()
	if latest == v.Current {
		m.updateState("已是最新发布版本")
		return nil
	}
	if latest == v.Failed && !manual {
		m.updateState("已跳过启动失败的版本 " + latest + "；可手动检查重试")
		return nil
	}
	m.updateState("正在准备 " + latest + "，当前服务继续运行")
	n, err := runtime.Detect(ctx, node)
	if err != nil {
		return err
	}
	if _, err = m.repo.Install(ctx, n, latest, m); err != nil {
		return err
	}
	m.op.Lock()
	defer m.op.Unlock()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	m.mu.Lock()
	v = m.versions
	m.mu.Unlock()
	if v.Current != latest {
		v.Pending = latest
	}
	if manual && v.Failed == latest {
		v.Failed = ""
	}
	if err = m.store.SaveVersions(v); err != nil {
		return err
	}
	m.mu.Lock()
	m.versions = v
	m.mu.Unlock()
	m.updateState("版本 " + latest + " 已准备，下次启动应用")
	m.cleanupVersions()
	return nil
}
