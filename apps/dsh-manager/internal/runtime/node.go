package runtime

import (
	"bytes"
	"context"
	"fmt"
	"kxh.dev/dsh-manager/internal/process"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Node struct {
	Executable string
	NPM        string
}

func Detect(ctx context.Context, path string) (Node, error) {
	if path == "" {
		var err error
		path, err = exec.LookPath("node.exe")
		if err != nil {
			return Node{}, fmt.Errorf("未找到 Node.js，请安装 Node.js 24 或选择 node.exe")
		}
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return Node{}, err
	}
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return Node{}, fmt.Errorf("Node.js 路径无效：%s", path)
	}
	var output bytes.Buffer
	probe, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	err = process.Run(probe, process.Launch{Executable: path, Args: []string{"--version"}, Directory: filepath.Dir(path), Output: &output})
	if err != nil {
		return Node{}, fmt.Errorf("无法运行 Node.js：%w", err)
	}
	version := strings.TrimPrefix(strings.TrimSpace(output.String()), "v")
	parts := strings.Split(version, ".")
	if len(parts) < 3 {
		return Node{}, fmt.Errorf("无法识别 Node.js 版本：%s", version)
	}
	major, _ := strconv.Atoi(parts[0])
	minor, _ := strconv.Atoi(parts[1])
	if !(major >= 24 || major == 22 && minor >= 19) {
		return Node{}, fmt.Errorf("Node.js %s 不兼容，需要 22.19+（22 系列）或 24+", version)
	}
	npm := filepath.Join(filepath.Dir(path), "node_modules", "npm", "bin", "npm-cli.js")
	if _, err = os.Stat(npm); err != nil {
		return Node{}, fmt.Errorf("Node.js 附近未找到 npm，请安装包含 npm 的 Node.js：%s", npm)
	}
	return Node{Executable: path, NPM: npm}, nil
}

// 通过 stdin 控制信号触发上游正常关闭钩子，Windows 无控制台进程不依赖 POSIX 信号。
const Bootstrap = `import {pathToFileURL} from 'node:url';
const entry=process.argv[1];
process.argv=[process.execPath,entry,...process.argv.slice(2)];
let pending='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
 pending+=chunk;
 if(pending.includes('\n')){
  if(pending.trim()==='stop'){
   if(process.listenerCount('SIGTERM')) process.emit('SIGTERM');
   else process.exit(0);
  }
  pending='';
 }
});
await import(pathToFileURL(entry).href);
`

func (n Node) Args(bin string, port int) []string {
	return []string{"--input-type=module", "-e", Bootstrap, bin, "web", "--host", "127.0.0.1", "--port", strconv.Itoa(port), "--no-open"}
}
