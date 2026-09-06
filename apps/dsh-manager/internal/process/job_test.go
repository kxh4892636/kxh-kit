package process_test

import (
	"bytes"
	"context"
	"kxh.dev/dsh-manager/internal/process"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

func node(t *testing.T) string {
	t.Helper()
	p, e := exec.LookPath("node.exe")
	if e != nil {
		t.Fatal(e)
	}
	return p
}
func port(t *testing.T) int {
	t.Helper()
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	n := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return n
}
func TestRunCapturesCompleteOutputAndExit(t *testing.T) {
	var out bytes.Buffer
	e := process.Run(context.Background(), process.Launch{Executable: node(t), Args: []string{"-e", "process.stdout.write('完整输出');process.exitCode=7"}, Directory: t.TempDir(), Output: &out})
	if e == nil || !strings.Contains(e.Error(), "7") || out.String() != "完整输出" {
		t.Fatalf("output=%q error=%v", out.String(), e)
	}
}
func TestJobOwnsOnlyItsPortAndStopsTree(t *testing.T) {
	n := port(t)
	script := "require('child_process').spawn(process.execPath,['-e'," + strconv.Quote("require('http').createServer((q,r)=>r.end('ready')).listen("+strconv.Itoa(n)+",'127.0.0.1')") + "],{stdio:'inherit'});setInterval(()=>{},1000)"
	p, e := process.Start(process.Launch{Executable: node(t), Args: []string{"-e", script}, Directory: t.TempDir()})
	if e != nil {
		t.Fatal(e)
	}
	defer p.Stop(0)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if e = p.Ready(ctx, n); e != nil {
		t.Fatal(e)
	}
	if p.PID() == 0 || !p.OwnsPort(n) {
		t.Fatal("受管子进程端口未归属")
	}
	if e = process.CheckPort(n); e == nil {
		t.Fatal("占用端口误报可用")
	}
	l, e := net.Listen("tcp4", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	if p.OwnsPort(l.Addr().(*net.TCPAddr).Port) {
		t.Fatal("错误接管外部端口")
	}
	p.Stop(0)
	if e = process.CheckPort(n); e != nil {
		t.Fatal(e)
	}
}
func TestReadyRejectsExitedAndCancelledProcess(t *testing.T) {
	for _, script := range []string{"process.exit(3)", "setInterval(()=>{},1000)"} {
		p, e := process.Start(process.Launch{Executable: node(t), Args: []string{"-e", script}, Directory: t.TempDir()})
		if e != nil {
			t.Fatal(e)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
		e = p.Ready(ctx, port(t))
		cancel()
		p.Stop(0)
		if e == nil {
			t.Fatal("不应就绪")
		}
	}
}
func TestLaunchErrorsAndCancellation(t *testing.T) {
	for _, l := range []process.Launch{
		{Executable: "missing.exe", Directory: t.TempDir()},
		{Executable: "bad\x00"},
		{Executable: node(t), Args: []string{"bad\x00"}},
		{Executable: node(t), Directory: "bad\x00"},
	} {
		if _, e := process.Start(l); e == nil {
			t.Fatal("无效启动未拒绝")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	e := process.Run(ctx, process.Launch{Executable: node(t), Args: []string{"-e", "setInterval(()=>{},1000)"}, Directory: t.TempDir()})
	if e != context.DeadlineExceeded {
		t.Fatalf("取消=%v", e)
	}
}
