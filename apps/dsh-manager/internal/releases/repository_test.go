package releases_test

import (
	"context"
	"fmt"
	"io"
	"kxh.dev/dsh-manager/internal/releases"
	"kxh.dev/dsh-manager/internal/runtime"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestLatestRequiresValidPublishedPackage(t *testing.T) {
	for _, body := range []string{`{"name":"@deepseek-ai/dsh","version":"1.2.3-rc.1"}`, `{"name":"other","version":"1.2.3"}`, `{"name":"@deepseek-ai/dsh","version":"../../oops"}`, "broken"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, body) }))
		repo := releases.New(t.TempDir())
		repo.URL = server.URL
		v, e := repo.Latest(context.Background())
		server.Close()
		if body[0] == '{' && body == `{"name":"@deepseek-ai/dsh","version":"1.2.3-rc.1"}` {
			if e != nil || v != "1.2.3-rc.1" {
				t.Fatal(v, e)
			}
		} else if e == nil {
			t.Fatal("无效发布被接受")
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	repo := releases.New(t.TempDir())
	repo.URL = server.URL
	if _, e := repo.Latest(context.Background()); e == nil {
		t.Fatal("HTTP 错误被吞掉")
	}
	server.Close()
	if _, e := repo.Latest(context.Background()); e == nil {
		t.Fatal("网络错误被吞掉")
	}
}
func fakeNPM(t *testing.T, script string) runtime.Node {
	t.Helper()
	node, e := exec.LookPath("node.exe")
	if e != nil {
		t.Fatal(e)
	}
	npm := filepath.Join(t.TempDir(), "npm.cjs")
	if e = os.WriteFile(npm, []byte(script), 0600); e != nil {
		t.Fatal(e)
	}
	return runtime.Node{Executable: node, NPM: npm}
}

const installFixture = `const fs=require('fs'),p=require('path');
const root=process.argv[process.argv.indexOf('--prefix')+1];
const dir=p.join(root,'node_modules','@deepseek-ai','dsh');
fs.mkdirSync(p.join(dir,'lib'),{recursive:true});
fs.writeFileSync(p.join(dir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'1.2.3'}));
fs.writeFileSync(p.join(dir,'lib','bin.js'),'process.exit(0)');
`

func TestInstallPromotesCompleteVersionAndReusesIt(t *testing.T) {
	repo := releases.New(filepath.Join(t.TempDir(), "安装 space"))
	n := fakeNPM(t, installFixture)
	bin, e := repo.Install(context.Background(), n, "1.2.3", io.Discard)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(bin); e != nil {
		t.Fatal(e)
	}
	n.Executable = "missing.exe"
	again, e := repo.Install(context.Background(), n, "1.2.3", io.Discard)
	if e != nil || again != bin {
		t.Fatal(again, e)
	}
	if _, e = repo.Bin("../x"); e == nil {
		t.Fatal("允许路径穿越")
	}
	os.WriteFile(filepath.Join(filepath.Dir(filepath.Dir(bin)), "package.json"), []byte(`{"name":"wrong","version":"1.2.3"}`), 0600)
	if _, e = repo.Bin("1.2.3"); e == nil {
		t.Fatal("安装身份不匹配被接受")
	}
}
func TestFailedInstallNeverBecomesAvailable(t *testing.T) {
	repo := releases.New(t.TempDir())
	n := fakeNPM(t, "process.exit(6)")
	if _, e := repo.Install(context.Background(), n, "1.2.3", io.Discard); e == nil {
		t.Fatal("失败安装返回成功")
	}
	if _, e := repo.Bin("1.2.3"); e == nil {
		t.Fatal("失败版本可启动")
	}
	entries, e := os.ReadDir(filepath.Join(repo.Root, "versions"))
	if e != nil || len(entries) != 0 {
		t.Fatal("临时安装未清理", e)
	}
	if _, e = repo.Install(context.Background(), n, "../x", io.Discard); e == nil {
		t.Fatal("允许路径穿越")
	}
}

func TestInvalidStagingIsNotPromotedAndOwnedCorruptionCanBeRepaired(t *testing.T) {
	repo := releases.New(t.TempDir())
	broken := fakeNPM(t, installFixture+"require('fs').writeFileSync(require('path').join(dir,'package.json'),'{}')")
	if _, e := repo.Install(context.Background(), broken, "1.2.3", io.Discard); e == nil {
		t.Fatal("无效临时包被提升")
	}
	if _, e := os.Stat(filepath.Join(repo.Root, "versions", "1.2.3")); !os.IsNotExist(e) {
		t.Fatal("无效安装留下正式目录", e)
	}
	n := fakeNPM(t, installFixture)
	bin, e := repo.Install(context.Background(), n, "1.2.3", io.Discard)
	if e != nil {
		t.Fatal(e)
	}
	if e = os.Remove(bin); e != nil {
		t.Fatal(e)
	}
	repaired, e := repo.Install(context.Background(), n, "1.2.3", io.Discard)
	if e != nil || repaired != bin {
		t.Fatal("无法修复自己的损坏安装", e)
	}
	if e = os.Remove(bin); e != nil {
		t.Fatal(e)
	}
	os.Remove(filepath.Join(repo.Root, "versions", "1.2.3", ".dsh-manager-owned"))
	if _, e = repo.Install(context.Background(), n, "1.2.3", io.Discard); e == nil {
		t.Fatal("未确认归属即删除")
	}
}
