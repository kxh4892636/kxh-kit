package process

import (
	"context"
	"fmt"
	"golang.org/x/sys/windows"
	"io"
	"os"
	"strings"
	"sync"
	"time"
	"unsafe"
)

type Process struct {
	job        windows.Handle
	info       windows.ProcessInformation
	input      *os.File
	done       chan struct{}
	outputDone chan struct{}
	mu         sync.Mutex
	err        error
	closeOnce  sync.Once
}

type Launch struct {
	Executable string
	Args       []string
	Directory  string
	Output     io.Writer
}

// 只向子进程继承标准流句柄，避免 Job 句柄泄漏导致退出后仍有孤儿进程。
func Start(l Launch) (*Process, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}
	p := &Process{job: job, done: make(chan struct{}), outputDone: make(chan struct{})}
	ok := false
	defer func() {
		if !ok {
			windows.CloseHandle(job)
		}
	}()
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits)))
	if err != nil {
		return nil, err
	}
	inR, inW, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer inR.Close()
	outR, outW, err := os.Pipe()
	if err != nil {
		inW.Close()
		return nil, err
	}
	defer outW.Close()
	p.input = inW
	err = p.create(l, inR, outW)
	if err != nil {
		inW.Close()
		outR.Close()
		return nil, err
	}
	ok = true
	go func() {
		defer close(p.outputDone)
		defer outR.Close()
		if l.Output != nil {
			io.Copy(l.Output, outR)
		} else {
			io.Copy(io.Discard, outR)
		}
	}()
	go p.wait()
	return p, nil
}

func (p *Process) create(l Launch, in, out *os.File) error {
	app, err := windows.UTF16PtrFromString(l.Executable)
	if err != nil {
		return err
	}
	args := append([]string{l.Executable}, l.Args...)
	for i := range args {
		args[i] = windows.EscapeArg(args[i])
	}
	cmd, err := windows.UTF16PtrFromString(strings.Join(args, " "))
	if err != nil {
		return err
	}
	dir, err := windows.UTF16PtrFromString(l.Directory)
	if err != nil {
		return err
	}
	handles := []windows.Handle{windows.Handle(in.Fd()), windows.Handle(out.Fd())}
	for _, h := range handles {
		if err = windows.SetHandleInformation(h, windows.HANDLE_FLAG_INHERIT, windows.HANDLE_FLAG_INHERIT); err != nil {
			return err
		}
	}
	attrs, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		return err
	}
	defer attrs.Delete()
	if err = attrs.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&handles[0]), uintptr(len(handles))*unsafe.Sizeof(handles[0])); err != nil {
		return err
	}
	si := windows.StartupInfoEx{StartupInfo: windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfoEx{})), Flags: windows.STARTF_USESTDHANDLES, StdInput: handles[0], StdOutput: handles[1], StdErr: handles[1]}, ProcThreadAttributeList: attrs.List()}
	flags := uint32(windows.CREATE_SUSPENDED | windows.CREATE_NO_WINDOW | windows.EXTENDED_STARTUPINFO_PRESENT)
	if err = windows.CreateProcess(app, cmd, nil, nil, true, flags, nil, dir, &si.StartupInfo, &p.info); err != nil {
		return err
	}
	defer windows.CloseHandle(p.info.Thread)
	if err = windows.AssignProcessToJobObject(p.job, p.info.Process); err == nil {
		_, err = windows.ResumeThread(p.info.Thread)
	}
	if err != nil {
		windows.TerminateProcess(p.info.Process, 1)
		windows.WaitForSingleObject(p.info.Process, windows.INFINITE)
		windows.CloseHandle(p.info.Process)
	}
	return err
}

func (p *Process) wait() {
	_, err := windows.WaitForSingleObject(p.info.Process, windows.INFINITE)
	var code uint32
	if err == nil {
		err = windows.GetExitCodeProcess(p.info.Process, &code)
	}
	if err == nil && code != 0 {
		err = fmt.Errorf("进程退出，代码 %d", code)
	}
	windows.TerminateJobObject(p.job, 1)
	<-p.outputDone
	p.mu.Lock()
	p.err = err
	p.mu.Unlock()
	close(p.done)
}
func (p *Process) Done() <-chan struct{} { return p.done }
func (p *Process) Err() error            { p.mu.Lock(); defer p.mu.Unlock(); return p.err }
func (p *Process) PID() uint32           { return p.info.ProcessId }
func (p *Process) Stop(grace time.Duration) error {
	p.closeOnce.Do(func() {
		p.input.WriteString("stop\n")
		timer := time.NewTimer(grace)
		select {
		case <-p.done:
		case <-timer.C:
		}
		timer.Stop()
		windows.TerminateJobObject(p.job, 1)
		<-p.done
		p.input.Close()
		windows.CloseHandle(p.info.Process)
		windows.CloseHandle(p.job)
	})
	return p.Err()
}
func Run(ctx context.Context, l Launch) error {
	p, err := Start(l)
	if err != nil {
		return err
	}
	defer p.Stop(0)
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-p.Done():
		return p.Err()
	}
}
