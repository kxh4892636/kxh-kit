package startup

import (
	"errors"
	"fmt"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"path/filepath"
)

const RunKey = `Software\Microsoft\Windows\CurrentVersion\Run`

type Entry struct {
	Key  string
	Name string
}

func Default() Entry { return Entry{Key: RunKey, Name: "DSHManager"} }
func (e Entry) Set(enabled bool, executable string) error {
	if !filepath.IsAbs(executable) {
		return fmt.Errorf("登录自启需要绝对路径")
	}
	if _, err := windows.UTF16PtrFromString(executable); err != nil {
		return err
	}
	key, _, err := registry.CreateKey(registry.CURRENT_USER, e.Key, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("设置登录自启：%w", err)
	}
	defer key.Close()
	if !enabled {
		err = key.DeleteValue(e.Name)
		if errors.Is(err, registry.ErrNotExist) {
			return nil
		}
		return err
	}
	return key.SetStringValue(e.Name, windows.EscapeArg(executable)+" --background")
}
