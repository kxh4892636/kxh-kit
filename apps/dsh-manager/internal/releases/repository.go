package releases

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"kxh.dev/dsh-manager/internal/process"
	"kxh.dev/dsh-manager/internal/runtime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

const Registry = "https://registry.npmjs.org/@deepseek-ai%2fdsh/latest"

var versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$`)

type Repository struct {
	once   sync.Once
	gate   chan struct{}
	Root   string
	URL    string
	Client *http.Client
}

func New(root string) *Repository {
	return &Repository{Root: root, URL: Registry, Client: &http.Client{Timeout: 30 * time.Second}}
}
func ValidVersion(v string) bool { return len(v) < 128 && versionPattern.MatchString(v) }
func (r *Repository) Latest(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", r.URL, nil)
	if err != nil {
		return "", err
	}
	resp, err := r.Client.Do(req)
	if err != nil {
		return "", fmt.Errorf("检查更新失败：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("更新服务器返回 HTTP %d", resp.StatusCode)
	}
	var data struct {
		Name    string
		Version string
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&data); err != nil {
		return "", err
	}
	if data.Name != "@deepseek-ai/dsh" || !ValidVersion(data.Version) {
		return "", fmt.Errorf("更新服务器返回无效的 DSH 版本")
	}
	return data.Version, nil
}
func (r *Repository) Bin(v string) (string, error) {
	if !ValidVersion(v) {
		return "", fmt.Errorf("无效版本：%q", v)
	}
	dir := filepath.Join(r.Root, "versions", v, "node_modules", "@deepseek-ai", "dsh")
	return validateBin(dir, v)
}
func validateBin(dir, v string) (string, error) {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return "", err
	}
	var p struct {
		Name    string
		Version string
	}
	if err = json.Unmarshal(data, &p); err != nil {
		return "", err
	}
	if p.Name != "@deepseek-ai/dsh" || p.Version != v {
		return "", fmt.Errorf("安装版本与记录不匹配")
	}
	bin := filepath.Join(dir, "lib", "bin.js")
	if _, err = os.Stat(bin); err != nil {
		return "", err
	}
	return bin, nil
}
func (r *Repository) Install(ctx context.Context, n runtime.Node, v string, log io.Writer) (string, error) {
	if err := r.lock(ctx); err != nil {
		return "", err
	}
	defer r.unlock()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if !ValidVersion(v) {
		return "", fmt.Errorf("无效版本")
	}
	if bin, err := r.Bin(v); err == nil {
		return bin, nil
	}
	versions := filepath.Join(r.Root, "versions")
	if err := os.MkdirAll(versions, 0700); err != nil {
		return "", err
	}
	stage, err := os.MkdirTemp(versions, ".install-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage) // MkdirTemp 返回由本工具创建的固定根子目录。
	if err = os.WriteFile(filepath.Join(stage, ".dsh-manager-owned"), []byte(v), 0600); err != nil {
		return "", err
	}
	install, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	args := []string{n.NPM, "install", "--prefix", stage, "--no-audit", "--no-fund", "--save-exact", "--registry=https://registry.npmjs.org", "@deepseek-ai/dsh@" + v}
	err = process.Run(install, process.Launch{Executable: n.Executable, Args: args, Directory: stage, Output: log})
	if err != nil {
		return "", fmt.Errorf("安装 DSH %s：%w", v, err)
	}
	if _, err = validateBin(filepath.Join(stage, "node_modules", "@deepseek-ai", "dsh"), v); err != nil {
		return "", fmt.Errorf("安装验证失败：%w", err)
	}
	target := filepath.Join(versions, v)
	if _, err = os.Stat(target); err == nil {
		marker, readErr := os.ReadFile(filepath.Join(target, ".dsh-manager-owned"))
		if readErr != nil || string(marker) != v {
			return "", fmt.Errorf("版本目录已存在且无法确认归属：%s", target)
		}
		if err = safeRemove(versions, target); err != nil {
			return "", err
		}
	}
	if err = os.Rename(stage, target); err != nil {
		return "", fmt.Errorf("保存安装：%w", err)
	}
	return r.Bin(v)
}
func safeRemove(root, target string) error {
	root, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return err
	}
	if filepath.Dir(target) != root {
		return fmt.Errorf("拒绝清理非版本目录：%s", target)
	}
	return os.RemoveAll(target)
}
