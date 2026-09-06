package manager

import (
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/settings"
)

// 调用方持有 op，版本记录与服务切换共同提交。
func (m *Manager) startPending(ctx context.Context, c settings.Config, current, pending string) error {
	if pending == "" || pending == current {
		return m.start(ctx, c, current)
	}
	err := m.start(ctx, c, pending)
	if err == nil || ctx.Err() != nil {
		return err
	}
	m.mu.Lock()
	versions := m.versions
	m.mu.Unlock()
	versions.Pending = ""
	versions.Failed = pending
	if saveErr := m.store.SaveVersions(versions); saveErr != nil {
		return fmt.Errorf("新版失败：%v；记录失败：%w", err, saveErr)
	}
	m.mu.Lock()
	m.versions = versions
	m.updateStatus = "版本 " + pending + " 启动失败，已暂停自动重试；可手动检查重试"
	m.signal()
	m.mu.Unlock()
	fmt.Fprintf(m, "新版 %s 启动失败：%v\n", pending, err)
	if current == "" {
		return err
	}
	fmt.Fprintln(m, "正在回退到", current)
	if rollback := m.start(ctx, c, current); rollback != nil {
		return fmt.Errorf("新版失败：%v；回退失败：%w", err, rollback)
	}
	fmt.Fprintln(m, "已回退到", current)
	return nil
}

func (m *Manager) cleanupVersions() {
	m.mu.Lock()
	v := m.versions
	installing := m.updateVersion
	m.mu.Unlock()
	if err := m.repo.Cleanup(v.Current, v.Previous, v.Pending, installing); err != nil {
		fmt.Fprintln(m, "旧版本清理失败：", err)
	}
}
