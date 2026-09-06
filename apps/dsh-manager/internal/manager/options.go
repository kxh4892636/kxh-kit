package manager

import (
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/startup"
	"os"
)

func (m *Manager) SetOptions(keepAlive, login bool) error {
	return m.applyOptions(m.claimOptions(), keepAlive, login)
}
func (m *Manager) RequestOptions(keepAlive, login bool) {
	intent := m.claimOptions()
	go func() {
		if err := m.applyOptions(intent, keepAlive, login); err != nil && err != context.Canceled {
			m.ReportError(err)
		}
	}()
}
func (m *Manager) claimOptions() uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.optionIntent++
	m.optionsBusy = true
	m.signal()
	return m.optionIntent
}
func (m *Manager) finishOptions(intent uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.optionIntent == intent {
		m.optionsBusy = false
		m.signal()
	}
}
func (m *Manager) applyOptions(intent uint64, keepAlive, login bool) error {
	m.op.Lock()
	defer m.op.Unlock()
	m.mu.Lock()
	if m.optionIntent != intent {
		m.mu.Unlock()
		return context.Canceled
	}
	previous := m.config
	c := previous
	m.mu.Unlock()
	defer m.finishOptions(intent)
	c.KeepAlive = keepAlive
	c.Login = login
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	entry := startup.Default()
	if previous.Login != login {
		if err = entry.Set(login, executable); err != nil {
			return err
		}
	}
	if err = m.store.SaveConfig(c); err != nil {
		if previous.Login != login {
			if rollback := entry.Set(previous.Login, executable); rollback != nil {
				return fmt.Errorf("保存配置失败：%v；恢复登录项失败：%w", err, rollback)
			}
		}
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.config = c
	if !keepAlive && m.proc == nil {
		m.intent++
		if m.cancel != nil {
			m.cancel()
		}
		m.retrySeconds = 0
		m.busy = false
		m.status = "已停止"
	}
	m.signal()
	return nil
}
