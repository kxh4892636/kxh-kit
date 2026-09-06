package startup_test

import (
	"fmt"
	"golang.org/x/sys/windows/registry"
	"kxh.dev/dsh-manager/internal/startup"
	"os"
	"strings"
	"testing"
)

func TestUserStartupEntryCanBeEnabledAndRemoved(t *testing.T) {
	path := fmt.Sprintf(`Software\KxhDSHManagerTests\%d`, os.Getpid())
	e := startup.Entry{Key: path, Name: "ManagedTest"}
	defer func() {
		if strings.HasPrefix(path, `Software\KxhDSHManagerTests\`) {
			registry.DeleteKey(registry.CURRENT_USER, path)
		}
	}()
	exe := `C:\Apps with spaces\DSH管理器.exe`
	if err := e.Set(true, exe); err != nil {
		t.Fatal(err)
	}
	k, err := registry.OpenKey(registry.CURRENT_USER, path, registry.QUERY_VALUE|registry.SET_VALUE)
	if err != nil {
		t.Fatal(err)
	}
	defer k.Close()
	actual, _, err := k.GetStringValue(e.Name)
	if err != nil || actual != `"C:\Apps with spaces\DSH管理器.exe" --background` {
		t.Fatalf("%q %v", actual, err)
	}
	k.SetStringValue("Other", "preserve")
	if err = e.Set(false, exe); err != nil {
		t.Fatal(err)
	}
	if _, _, err = k.GetStringValue(e.Name); err != registry.ErrNotExist {
		t.Fatal("登录项仍存在", err)
	}
	if actual, _, err = k.GetStringValue("Other"); err != nil || actual != "preserve" {
		t.Fatal("修改了其他登录项")
	}
	if err = e.Set(false, exe); err != nil {
		t.Fatal("重复关闭应幂等", err)
	}
	if err = e.Set(true, "relative.exe"); err == nil {
		t.Fatal("相对路径被接受")
	}
	if err = e.Set(true, "C:\\bad\x00.exe"); err == nil {
		t.Fatal("空字符路径被接受")
	}
	if startup.Default().Key != startup.RunKey {
		t.Fatal("默认登录位置不符")
	}
}
