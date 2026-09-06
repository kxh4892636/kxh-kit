package settings

import (
	"encoding/json"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Port       int    `json:"port"`
	Directory  string `json:"directory"`
	Node       string `json:"node"`
	KeepAlive  bool   `json:"keepAlive"`
	Login      bool   `json:"login"`
	AutoUpdate bool   `json:"autoUpdate"`
}

type Versions struct {
	Current  string `json:"current"`
	Previous string `json:"previous,omitempty"`
	Pending  string `json:"pending,omitempty"`
	Failed   string `json:"failed,omitempty"`
}

type Store struct{ Root string }

func Default() Config {
	dir, _ := os.UserHomeDir()
	return Config{Port: 3080, Directory: dir, KeepAlive: true, AutoUpdate: true}
}

func (s Store) LoadConfig() (Config, error) {
	c := Default()
	err := s.read("config.json", &c)
	if err == nil {
		err = c.Validate()
	}
	return c, err
}
func (s Store) LoadVersions() (Versions, error) {
	var v Versions
	return v, s.read("versions.json", &v)
}
func (c Config) Validate() error {
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("端口必须为 1–65535")
	}
	if strings.ContainsRune(c.Directory, 0) || strings.ContainsRune(c.Node, 0) {
		return fmt.Errorf("路径不能包含空字符")
	}
	if !filepath.IsAbs(c.Directory) {
		return fmt.Errorf("工作目录必须是绝对路径")
	}
	info, err := os.Stat(c.Directory)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("工作目录不存在：%s", c.Directory)
	}
	return nil
}
func (s Store) SaveConfig(c Config) error {
	if err := c.Validate(); err != nil {
		return err
	}
	return s.write("config.json", c)
}
func (s Store) SaveVersions(v Versions) error { return s.write("versions.json", v) }
func (s Store) read(name string, target any) error {
	b, err := os.ReadFile(filepath.Join(s.Root, name))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取配置：%w", err)
	}
	if err = json.Unmarshal(b, target); err != nil {
		return fmt.Errorf("%s 已损坏，请修复或重命名后重试：%w", name, err)
	}
	return nil
}
func (s Store) write(name string, v any) error {
	if err := os.MkdirAll(s.Root, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(s.Root, ".settings-")
	if err != nil {
		return err
	}
	temp := f.Name()
	defer os.Remove(temp)
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	src, err := windows.UTF16PtrFromString(temp)
	if err != nil {
		return err
	}
	dst, err := windows.UTF16PtrFromString(filepath.Join(s.Root, name))
	if err != nil {
		return err
	}
	return windows.MoveFileEx(src, dst, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}
