package releases

import (
	"context"
	"io"
	"kxh.dev/dsh-manager/internal/runtime"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCleanupRetainsNamedAndUnknownDirectories(t *testing.T) {
	root := t.TempDir()
	r := New(root)
	if err := r.Cleanup(); err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{"1.0.0", "2.0.0", "3.0.0", "4.0.0", "5.0.0", ".install-active", "unknown"} {
		dir := filepath.Join(root, "versions", v)
		os.MkdirAll(dir, 0700)
		if v != "5.0.0" {
			os.WriteFile(filepath.Join(dir, ".dsh-manager-owned"), []byte(v), 0600)
		}
	}
	if err := r.Cleanup("1.0.0", "2.0.0", "3.0.0"); err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{"1.0.0", "2.0.0", "3.0.0", "5.0.0", ".install-active", "unknown"} {
		if _, err := os.Stat(filepath.Join(root, "versions", v)); err != nil {
			t.Fatal("错误删除", v, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "versions", "4.0.0")); !os.IsNotExist(err) {
		t.Fatal("旧版本未清理", err)
	}
	if err := safeRemove(filepath.Join(root, "versions"), root); err == nil {
		t.Fatal("越界删除被允许")
	}
}

func TestWaitingInstallCanBeCanceled(t *testing.T) {
	r := New(t.TempDir())
	if err := r.lock(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer r.unlock()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := r.Install(ctx, runtime.Node{}, "1.0.0", io.Discard); done <- err }()
	cancel()
	select {
	case err := <-done:
		if err != context.Canceled {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("锁等待不能取消")
	}
}
