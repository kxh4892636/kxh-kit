package desktop

import (
	"fmt"
	"github.com/lxn/win"
	"golang.org/x/sys/windows"
	"strconv"
	"strings"
	"unsafe"
)

const (
	idExit      = 400
	idKeepAlive = 301
	idLogin     = 302
)
const (
	idPort = 101 + iota
	idDirectory
	idNode
	idBrowseNode
	idSave
	idStart
	idStop
	idRestart
	idOpen
	idState
	idVersion
	idLog
)

func (w *Window) add(id int, class, label string, style uint32) error {
	h := win.CreateWindowEx(0, text(class), text(label), win.WS_CHILD|win.WS_VISIBLE|style,
		0, 0, 0, 0, w.hwnd, win.HMENU(id), win.GetModuleHandle(nil), nil)
	if h == 0 {
		return fmt.Errorf("无法创建控件：%s", label)
	}
	w.controls[id] = h
	if class == "EDIT" {
		win.SendMessage(h, win.EM_SETLIMITTEXT, 32767, 0)
	}
	return nil
}
func (w *Window) build() error {
	c := w.manager.Snapshot().Config
	items := []struct {
		id           int
		class, label string
		style        uint32
	}{
		{idPort, "EDIT", strconv.Itoa(c.Port), win.WS_TABSTOP | win.WS_BORDER | win.ES_NUMBER},
		{idDirectory, "EDIT", c.Directory, win.WS_TABSTOP | win.WS_BORDER | win.ES_AUTOHSCROLL},
		{idNode, "EDIT", c.Node, win.WS_TABSTOP | win.WS_BORDER | win.ES_AUTOHSCROLL},
		{idBrowseNode, "BUTTON", "选择…", win.WS_TABSTOP},
		{idSave, "BUTTON", "保存设置", win.WS_TABSTOP},
		{idStart, "BUTTON", "启动 / 首次安装", win.WS_TABSTOP},
		{idStop, "BUTTON", "停止", win.WS_TABSTOP},
		{idRestart, "BUTTON", "重启", win.WS_TABSTOP},
		{idOpen, "BUTTON", "打开 Web UI", win.WS_TABSTOP},
		{idState, "STATIC", "已停止", 0},
		{idVersion, "STATIC", "DSH 尚未安装", 0},
		{idLog, "EDIT", "", win.WS_BORDER | win.WS_VSCROLL | win.ES_MULTILINE | win.ES_READONLY | win.ES_AUTOVSCROLL},
		{idKeepAlive, "BUTTON", "异常退出自动重启", win.WS_TABSTOP | win.BS_AUTOCHECKBOX},
		{idLogin, "BUTTON", "登录时启动并保活", win.WS_TABSTOP | win.BS_AUTOCHECKBOX},
		{idExit, "BUTTON", "退出并停止服务", win.WS_TABSTOP},
	}
	for _, i := range items {
		if err := w.add(i.id, i.class, i.label, i.style); err != nil {
			return err
		}
	}
	for i, s := range []string{"端口", "工作目录", "Node.js", "留空使用系统 Node.js；首次安装需要网络。", "运行日志"} {
		id := 200 + i
		if err := w.add(id, "STATIC", s, 0); err != nil {
			return err
		}
	}
	if c.KeepAlive {
		win.SendMessage(w.controls[idKeepAlive], win.BM_SETCHECK, win.BST_CHECKED, 0)
	}
	if c.Login {
		win.SendMessage(w.controls[idLogin], win.BM_SETCHECK, win.BST_CHECKED, 0)
	}
	w.layout()
	return nil
}
func (w *Window) layout() {
	dpi := win.GetDpiForWindow(w.hwnd)
	if dpi == 0 {
		dpi = 96
	}
	w.dpi = dpi
	scale := func(n int32) int32 { return n * int32(dpi) / 96 }
	var r win.RECT
	win.GetClientRect(w.hwnd, &r)
	width := r.Right * 96 / int32(dpi)
	height := r.Bottom * 96 / int32(dpi)
	width = max(width, 700)
	height = max(height, 520)
	positions := map[int][4]int32{
		200: {20, 22, 74, 24}, idPort: {104, 18, 110, 27},
		201: {20, 61, 74, 24}, idDirectory: {104, 57, width - 126, 27},
		202: {20, 100, 74, 24}, idNode: {104, 96, width - 214, 27}, idBrowseNode: {width - 102, 95, 80, 29},
		203: {104, 132, width - 126, 24}, idSave: {width - 120, 167, 98, 30},
		idState: {20, 168, width - 155, 44}, idVersion: {20, 210, width - 42, 24},
		idStart: {20, 248, 144, 34}, idStop: {176, 248, 78, 34}, idRestart: {266, 248, 78, 34}, idOpen: {356, 248, 140, 34},
		idExit: {508, 248, 180, 34}, idKeepAlive: {20, 296, 220, 24}, idLogin: {270, 296, 230, 24},
		204: {20, 335, 120, 24}, idLog: {20, 363, width - 42, height - 383},
	}
	for id, p := range positions {
		win.MoveWindow(w.controls[id], scale(p[0]), scale(p[1]), scale(p[2]), scale(p[3]), true)
	}
	lf := win.LOGFONT{LfHeight: -scale(14)}
	copy(lf.LfFaceName[:], sysUTF16("Microsoft YaHei UI"))
	font := win.CreateFontIndirect(&lf)
	if font != 0 {
		old := w.font
		w.font = font
		for _, h := range w.controls {
			win.SendMessage(h, win.WM_SETFONT, uintptr(font), 1)
		}
		if old != 0 {
			win.DeleteObject(win.HGDIOBJ(old))
		}
	}
}
func sysUTF16(s string) []uint16 {
	p := text(s)
	if p == nil {
		return nil
	}
	var out []uint16
	for i := uintptr(0); ; i++ {
		v := *(*uint16)(unsafe.Add(unsafe.Pointer(p), i*2))
		if v == 0 {
			return out
		}
		out = append(out, v)
	}
}
func value(h win.HWND) string {
	length := win.SendMessage(h, win.WM_GETTEXTLENGTH, 0, 0)
	buf := make([]uint16, length+1)
	win.SendMessage(h, win.WM_GETTEXT, uintptr(len(buf)), uintptr(unsafe.Pointer(&buf[0])))
	return windows.UTF16ToString(buf)
}
func setText(h win.HWND, s string) {
	win.SendMessage(h, win.WM_SETTEXT, 0, uintptr(unsafe.Pointer(text(s))))
}
func (w *Window) refresh() {
	s := w.manager.Snapshot()
	status := s.Status
	if s.Error != "" {
		status += " · " + s.Error
	}
	setText(w.controls[idState], status)
	version := s.Version
	if version == "" {
		version = "尚未安装"
	}
	if s.Running {
		version += fmt.Sprintf(" · http://127.0.0.1:%d/", s.Config.Port)
	}
	setText(w.controls[idVersion], "DSH "+version)
	log := strings.ReplaceAll(strings.ReplaceAll(s.Log, "\r\n", "\n"), "\n", "\r\n")
	if value(w.controls[idLog]) != log {
		setText(w.controls[idLog], log)
		win.SendMessage(w.controls[idLog], win.EM_SETSEL, ^uintptr(0), ^uintptr(0))
		win.SendMessage(w.controls[idLog], win.EM_SCROLLCARET, 0, 0)
	}
	editable := !s.Busy && !s.Running
	for _, id := range []int{idPort, idDirectory, idNode, idBrowseNode, idSave, idStart} {
		win.EnableWindow(w.controls[id], editable)
	}
	win.EnableWindow(w.controls[idStop], s.Busy || s.Running || s.RetrySeconds > 0)
	win.EnableWindow(w.controls[idRestart], s.Running && !s.Busy)
	win.EnableWindow(w.controls[idOpen], s.Running)
	w.updateTray(s.Status)
	if !s.OptionsBusy {
		for id, checked := range map[int]bool{idKeepAlive: s.Config.KeepAlive, idLogin: s.Config.Login} {
			value := uintptr(win.BST_UNCHECKED)
			if checked {
				value = win.BST_CHECKED
			}
			win.SendMessage(w.controls[id], win.BM_SETCHECK, value, 0)
		}
	}
	win.EnableWindow(w.controls[idKeepAlive], !s.OptionsBusy && !s.Busy)
	win.EnableWindow(w.controls[idLogin], !s.OptionsBusy && !s.Busy)
}
func (w *Window) save() bool {
	c := w.manager.Snapshot().Config
	port, err := strconv.Atoi(value(w.controls[idPort]))
	if err != nil {
		w.manager.ReportError(fmt.Errorf("端口必须为数字"))
		return false
	}
	c.Port = port
	c.Directory = strings.TrimSpace(value(w.controls[idDirectory]))
	c.Node = strings.TrimSpace(value(w.controls[idNode]))
	if err = w.manager.Save(c); err != nil {
		w.manager.ReportError(err)
		return false
	}
	return true
}
func (w *Window) command(id int) {
	switch id {
	case idKeepAlive, idLogin:
		keep := win.SendMessage(w.controls[idKeepAlive], win.BM_GETCHECK, 0, 0) == win.BST_CHECKED
		login := win.SendMessage(w.controls[idLogin], win.BM_GETCHECK, 0, 0) == win.BST_CHECKED
		w.manager.RequestOptions(keep, login)
	case idExit:
		w.exit()
	case idSave:
		w.save()
	case idStart:
		if w.save() {
			w.manager.Request("start")
		}
	case idStop:
		w.manager.Request("stop")
	case idRestart:
		w.manager.Request("restart")
	case idOpen:
		address := w.manager.Snapshot().Address
		result, _, _ := windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteW").Call(uintptr(w.hwnd), uintptr(unsafe.Pointer(text("open"))), uintptr(unsafe.Pointer(text(address))), 0, 0, win.SW_SHOWNORMAL)
		if result <= 32 {
			w.manager.ReportError(fmt.Errorf("无法打开默认浏览器"))
		}
	case idBrowseNode:
		w.browseNode()
	}
}
func (w *Window) browseNode() {
	buf := make([]uint16, 32768)
	filter := []uint16{'N', 'o', 'd', 'e', '.', 'j', 's', 0, '*', '.', 'e', 'x', 'e', 0, 0}
	dialog := win.OPENFILENAME{LStructSize: uint32(unsafe.Sizeof(win.OPENFILENAME{})), HwndOwner: w.hwnd,
		LpstrFilter: &filter[0], LpstrFile: &buf[0], NMaxFile: uint32(len(buf)), Flags: win.OFN_FILEMUSTEXIST | win.OFN_PATHMUSTEXIST | win.OFN_NOCHANGEDIR}
	if win.GetOpenFileName(&dialog) {
		setText(w.controls[idNode], windows.UTF16ToString(buf))
	}
}
