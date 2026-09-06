package main

import (
	"fmt"
	"kxh.dev/dsh-manager/internal/desktop"
	"kxh.dev/dsh-manager/internal/manager"
	"os"
	"path/filepath"
)

func main() {
	if err := run(); err != nil {
		desktop.ShowError(err)
	}
}
func run() error {
	root, err := os.UserCacheDir()
	if err != nil {
		return fmt.Errorf("无法定位用户数据目录：%w", err)
	}
	m, err := manager.New(filepath.Join(root, "DSHManager"))
	if err != nil {
		return err
	}
	hidden := len(os.Args) > 1 && os.Args[1] == "--background"
	return desktop.Run(m, hidden)
}
