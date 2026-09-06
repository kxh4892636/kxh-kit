package settings_test

import (
	"kxh.dev/dsh-manager/internal/settings"
	"os"
	"path/filepath"
	"testing"
)

func TestConfigRoundTripAndAtomicReplacement(t *testing.T) {
	s := settings.Store{Root: filepath.Join(t.TempDir(), "设置 space")}
	c, e := s.LoadConfig()
	if e != nil || c.Port != 3080 {
		t.Fatalf("%+v %v", c, e)
	}
	c.Directory = t.TempDir()
	c.Node = "C:\\Node space\\node.exe"
	c.Port = 49001
	if e = s.SaveConfig(c); e != nil {
		t.Fatal(e)
	}
	c.Port = 49002
	if e = s.SaveConfig(c); e != nil {
		t.Fatal(e)
	}
	got, e := s.LoadConfig()
	if e != nil || got != c {
		t.Fatalf("%+v %v", got, e)
	}
	if e = s.SaveVersions(settings.Versions{Current: "1.2.3"}); e != nil {
		t.Fatal(e)
	}
	v, e := s.LoadVersions()
	if e != nil || v.Current != "1.2.3" {
		t.Fatalf("%+v %v", v, e)
	}
	entries, _ := os.ReadDir(s.Root)
	if len(entries) != 2 {
		t.Fatal("临时配置泄漏")
	}
}
func TestInvalidSettingsPreserveSavedData(t *testing.T) {
	s := settings.Store{Root: t.TempDir()}
	good := settings.Config{Port: 3080, Directory: t.TempDir()}
	if e := s.SaveConfig(good); e != nil {
		t.Fatal(e)
	}
	for _, c := range []settings.Config{{Port: 0}, {Port: 65536}, {Port: 80, Directory: "relative"}, {Port: 80, Directory: "bad\x00"}, {Port: 80, Directory: filepath.Join(t.TempDir(), "missing")}} {
		if e := s.SaveConfig(c); e == nil {
			t.Fatal("无效配置已保存")
		}
	}
	got, e := s.LoadConfig()
	if e != nil || got != good {
		t.Fatal("破坏原配置")
	}
	os.WriteFile(filepath.Join(s.Root, "config.json"), []byte("{"), 0600)
	if _, e = s.LoadConfig(); e == nil {
		t.Fatal("损坏配置被静默覆盖")
	}
	os.Mkdir(filepath.Join(s.Root, "versions.json"), 0700)
	if _, e = s.LoadVersions(); e == nil {
		t.Fatal("目录误认为配置文件")
	}
	bad := settings.Store{Root: filepath.Join(s.Root, "config.json", "child")}
	if e = bad.SaveVersions(settings.Versions{}); e == nil {
		t.Fatal("写入失败被吞掉")
	}
}
