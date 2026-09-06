package desktop

import (
	"fmt"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"
	"kxh.dev/dsh-manager/internal/manager"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	title         = "DSH 管理器"
	wmRefresh     = win.WM_APP + 1
	wmExit        = win.WM_APP + 2
	sizeMinimized = 1
)

type Window struct {
	hwnd     win.HWND
	controls map[int]win.HWND
	labels   []win.HWND
	font     win.HFONT
	dpi      uint32
	manager  *manager.Manager
	closing  bool
	done     chan struct{}
	posted   atomic.Bool
}

var active *Window
var className = "KxhDSHManager"
var windowProc = syscall.NewCallback(dispatch)

func text(s string) *uint16 { p, _ := windows.UTF16PtrFromString(s); return p }
func Run(m *manager.Manager, hidden bool) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	mutex, existing, err := singleInstance()
	if err != nil {
		return err
	}
	defer windows.CloseHandle(mutex)
	if existing {
		hwnd := win.FindWindow(text(className), nil)
		if hwnd != 0 {
			win.ShowWindow(hwnd, win.SW_RESTORE)
			win.SetForegroundWindow(hwnd)
		}
		return nil
	}
	w, err := create(m)
	if err != nil {
		return err
	}
	active = w
	defer func() { active = nil; close(w.done) }()
	go w.listen()
	if !hidden {
		win.ShowWindow(w.hwnd, win.SW_SHOW)
	}
	var msg win.MSG
	for {
		ret := win.GetMessage(&msg, 0, 0, 0)
		if ret == 0 {
			break
		}
		if ret == -1 {
			return fmt.Errorf("Windows 消息循环失败")
		}
		if !win.IsDialogMessage(w.hwnd, &msg) {
			win.TranslateMessage(&msg)
			win.DispatchMessage(&msg)
		}
	}
	return nil
}
func singleInstance() (windows.Handle, bool, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return 0, false, err
	}
	name := text("Local\\" + className + "-" + user.User.Sid.String())
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		return h, true, nil
	}
	return h, false, err
}
func create(m *manager.Manager) (*Window, error) {
	instance := win.GetModuleHandle(nil)
	wc := win.WNDCLASSEX{CbSize: uint32(unsafe.Sizeof(win.WNDCLASSEX{})), LpfnWndProc: windowProc, HInstance: instance,
		HCursor: win.LoadCursor(0, win.MAKEINTRESOURCE(win.IDC_ARROW)), HIcon: win.LoadIcon(0, win.MAKEINTRESOURCE(win.IDI_APPLICATION)),
		HbrBackground: win.HBRUSH(win.COLOR_BTNFACE + 1), LpszClassName: text(className)}
	win.RegisterClassEx(&wc)
	hwnd := win.CreateWindowEx(win.WS_EX_CONTROLPARENT, text(className), text(title), win.WS_OVERLAPPEDWINDOW,
		win.CW_USEDEFAULT, win.CW_USEDEFAULT, 760, 600, 0, 0, instance, nil)
	if hwnd == 0 {
		return nil, fmt.Errorf("无法创建原生窗口")
	}
	w := &Window{hwnd: hwnd, manager: m, controls: make(map[int]win.HWND), done: make(chan struct{})}
	dpi := win.GetDpiForWindow(hwnd)
	if dpi > 96 {
		win.SetWindowPos(hwnd, 0, 0, 0, 760*int32(dpi)/96, 600*int32(dpi)/96, win.SWP_NOMOVE|win.SWP_NOZORDER)
	}
	if err := w.build(); err != nil {
		win.DestroyWindow(hwnd)
		return nil, err
	}
	w.refresh()
	return w, nil
}
func dispatch(hwnd win.HWND, msg uint32, wp, lp uintptr) uintptr {
	w := active
	if w == nil || w.hwnd != hwnd {
		return win.DefWindowProc(hwnd, msg, wp, lp)
	}
	switch msg {
	case win.WM_COMMAND:
		w.command(int(win.LOWORD(uint32(wp))))
		return 0
	case wmRefresh:
		w.posted.Store(false)
		w.refresh()
		return 0
	case win.WM_SIZE:
		if wp != sizeMinimized {
			w.layout()
		}
		return 0
	case win.WM_GETMINMAXINFO:
		// lParam 是 Windows 在同步回调期间借出的 MINMAXINFO 指针，不保存到回调外。
		info := *(**win.MINMAXINFO)(unsafe.Pointer(&lp))
		dpi := w.dpi
		if dpi == 0 {
			dpi = 96
		}
		info.PtMinTrackSize = win.POINT{X: 760 * int32(dpi) / 96, Y: 600 * int32(dpi) / 96}
		return 0
	case win.WM_DPICHANGED:
		var r win.RECT
		win.GetWindowRect(hwnd, &r)
		dpi := uint32(win.HIWORD(uint32(wp)))
		if w.dpi != 0 && dpi != 0 {
			win.SetWindowPos(hwnd, 0, 0, 0, (r.Right-r.Left)*int32(dpi)/int32(w.dpi), (r.Bottom-r.Top)*int32(dpi)/int32(w.dpi), win.SWP_NOMOVE|win.SWP_NOZORDER)
		}
		w.layout()
		return 0
	case win.WM_CLOSE:
		w.exit()
		return 0
	case win.WM_QUERYENDSESSION:
		return 1
	case win.WM_ENDSESSION:
		if wp != 0 {
			w.manager.Stop()
		}
		return 0
	case wmExit:
		win.DestroyWindow(hwnd)
		return 0
	case win.WM_DESTROY:
		if w.font != 0 {
			win.DeleteObject(win.HGDIOBJ(w.font))
		}
		win.PostQuitMessage(0)
		return 0
	}
	return win.DefWindowProc(hwnd, msg, wp, lp)
}
func (w *Window) listen() {
	for {
		select {
		case <-w.done:
			return
		case <-w.manager.Changes():
			if w.posted.CompareAndSwap(false, true) {
				win.PostMessage(w.hwnd, wmRefresh, 0, 0)
			}
			timer := time.NewTimer(100 * time.Millisecond)
			select {
			case <-w.done:
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}
}
func (w *Window) exit() {
	if w.closing {
		return
	}
	w.closing = true
	win.EnableWindow(w.hwnd, false)
	go func() { w.manager.Stop(); win.PostMessage(w.hwnd, wmExit, 0, 0) }()
}
func ShowError(err error) {
	win.MessageBox(0, text(err.Error()), text(title), win.MB_OK|win.MB_ICONERROR)
}
