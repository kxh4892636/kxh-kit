package releases

import (
	"context"
	"os"
	"path/filepath"
)

// 只清理直属、带匹配归属标记的版本目录；跳过链接和安装暂存目录。
func (r *Repository) Cleanup(keep ...string) error {
	if err := r.lock(context.Background()); err != nil {
		return err
	}
	defer r.unlock()
	root := filepath.Join(r.Root, "versions")
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	retained := make(map[string]bool)
	for _, v := range keep {
		retained[v] = true
	}
	for _, entry := range entries {
		v := entry.Name()
		if !entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !ValidVersion(v) || retained[v] {
			continue
		}
		target := filepath.Join(root, v)
		marker, err := os.ReadFile(filepath.Join(target, ".dsh-manager-owned"))
		if err != nil || string(marker) != v {
			continue
		}
		if err := safeRemove(root, target); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) lock(ctx context.Context) error {
	r.once.Do(func() { r.gate = make(chan struct{}, 1) })
	select {
	case r.gate <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (r *Repository) unlock() { <-r.gate }
