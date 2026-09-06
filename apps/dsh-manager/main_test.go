package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEntryRejectsCorruptConfig(t *testing.T) {
	root := t.TempDir()
	t.Setenv("LocalAppData", root)
	dir := filepath.Join(root, "DSHManager")
	if e := os.MkdirAll(dir, 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(dir, "config.json"), []byte("{"), 0600); e != nil {
		t.Fatal(e)
	}
	if e := run(); e == nil {
		t.Fatal("损坏配置不应静默启动")
	}
}
