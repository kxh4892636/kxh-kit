package desktop

import (
	"fmt"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"
	"unsafe"
)

const wmTray = win.WM_APP + 3
const idShow = 401

func (w *Window) trayData() win.NOTIFYICONDATA {
	data := win.NOTIFYICONDATA{CbSize: uint32(unsafe.Sizeof(win.NOTIFYICONDATA{})), HWnd: w.hwnd, UID: 1,
		UFlags: win.NIF_MESSAGE | win.NIF_ICON | win.NIF_TIP, UCallbackMessage: wmTray, HIcon: win.LoadIcon(0, win.MAKEINTRESOURCE(win.IDI_APPLICATION))}
	copy(data.SzTip[:], sysUTF16(title+" · "+w.manager.Snapshot().Status))
	return data
}
func (w *Window) addTray() {
	data := w.trayData()
	w.tray = win.Shell_NotifyIcon(win.NIM_ADD, &data)
	if !w.tray {
		w.manager.ReportError(fmt.Errorf("无法创建托盘图标，窗口将保持可见"))
		win.ShowWindow(w.hwnd, win.SW_SHOW)
	}
}
func (w *Window) removeTray() {
	if w.tray {
		data := w.trayData()
		win.Shell_NotifyIcon(win.NIM_DELETE, &data)
		w.tray = false
	}
}
func (w *Window) updateTray(status string) {
	if !w.tray || w.trayStatus == status {
		return
	}
	data := w.trayData()
	if win.Shell_NotifyIcon(win.NIM_MODIFY, &data) {
		w.trayStatus = status
	}
}
func (w *Window) trayEvent(event uint32) {
	switch event {
	case win.WM_LBUTTONDBLCLK, 0x400, 0x401:
		win.ShowWindow(w.hwnd, win.SW_RESTORE)
		win.SetForegroundWindow(w.hwnd)
	case win.WM_RBUTTONUP, win.WM_CONTEXTMENU:
		w.trayMenu()
	}
}
func (w *Window) trayMenu() {
	menu := win.CreatePopupMenu()
	if menu == 0 {
		return
	}
	defer win.DestroyMenu(menu)
	appendItem := windows.NewLazySystemDLL("user32.dll").NewProc("AppendMenuW")
	for _, item := range []struct {
		id    int
		label string
	}{{idShow, "显示窗口"}, {idStart, "启动"}, {idStop, "停止"}, {idOpen, "打开 Web UI"}, {idExit, "退出并停止服务"}} {
		result, _, _ := appendItem.Call(uintptr(menu), 0, uintptr(item.id), uintptr(unsafe.Pointer(text(item.label))))
		if result == 0 {
			w.manager.ReportError(fmt.Errorf("无法创建托盘菜单"))
			return
		}
	}
	var point win.POINT
	win.GetCursorPos(&point)
	win.SetForegroundWindow(w.hwnd)
	selected := win.TrackPopupMenu(menu, win.TPM_RETURNCMD|win.TPM_RIGHTBUTTON, point.X, point.Y, 0, w.hwnd, nil)
	if selected == idShow {
		w.trayEvent(win.WM_LBUTTONDBLCLK)
	} else {
		w.command(int(selected))
	}
	win.PostMessage(w.hwnd, win.WM_NULL, 0, 0)
}
