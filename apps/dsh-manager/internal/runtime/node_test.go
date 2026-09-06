package runtime_test

import (
	"context"
	"kxh.dev/dsh-manager/internal/runtime"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestDetectSystemNodeAndArguments(t *testing.T) {
	n, e := runtime.Detect(context.Background(), "")
	if e != nil {
		t.Fatal(e)
	}
	if !filepath.IsAbs(n.Executable) || !strings.HasSuffix(n.NPM, "npm-cli.js") {
		t.Fatalf("%+v", n)
	}
	args := n.Args("C:\\中文 path\\bin.js", 43001)
	if args[3] != "C:\\中文 path\\bin.js" || args[8] != "43001" || args[9] != "--no-open" {
		t.Fatal(args)
	}
}
func TestDetectMissingNodeAndNPM(t *testing.T) {
	if _, e := runtime.Detect(context.Background(), filepath.Join(t.TempDir(), "missing.exe")); e == nil {
		t.Fatal("未报告缺失")
	}
	n, e := exec.LookPath("node.exe")
	if e != nil {
		t.Fatal(e)
	}
	data, e := os.ReadFile(n)
	if e != nil {
		t.Fatal(e)
	}
	path := filepath.Join(t.TempDir(), "node.exe")
	if e = os.WriteFile(path, data, 0700); e != nil {
		t.Fatal(e)
	}
	if _, e = runtime.Detect(context.Background(), path); e == nil || !strings.Contains(e.Error(), "npm") {
		t.Fatalf("%v", e)
	}
	t.Setenv("PATH", t.TempDir())
	if _, e = runtime.Detect(context.Background(), ""); e == nil {
		t.Fatal("空 PATH 未拒绝")
	}
}
