package process

import (
	"context"
	"encoding/binary"
	"fmt"
	"golang.org/x/sys/windows"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strconv"
	"time"
	"unsafe"
)

var tcpTable = windows.NewLazySystemDLL("iphlpapi.dll").NewProc("GetExtendedTcpTable")
var inJob = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")

func CheckPort(port int) error {
	l, err := net.Listen("tcp4", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		return fmt.Errorf("端口 %d 已占用或不可用：%w", port, err)
	}
	return l.Close()
}
func (p *Process) OwnsPort(port int) bool {
	size := uint32(0)
	tcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, 2, 3, 0)
	if size < 4 || size > 16<<20 {
		return false
	}
	buf := make([]byte, size)
	ret, _, _ := tcpTable.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), 0, 2, 3, 0)
	if ret != 0 {
		return false
	}
	count := int(binary.LittleEndian.Uint32(buf))
	for i := 0; i < count; i++ {
		offset := 4 + i*24
		if offset+24 > len(buf) {
			return false
		}
		row := buf[offset : offset+24]
		if binary.LittleEndian.Uint32(row) != 2 || int(binary.BigEndian.Uint16(row[8:10])) != port {
			continue
		}
		pid := binary.LittleEndian.Uint32(row[20:24])
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
		if err != nil {
			continue
		}
		var belongs int32
		ok, _, _ := inJob.Call(uintptr(h), uintptr(p.job), uintptr(unsafe.Pointer(&belongs)))
		windows.CloseHandle(h)
		if ok != 0 && belongs != 0 {
			return true
		}
	}
	return false
}
func (p *Process) Ready(ctx context.Context, port int) error {
	return p.ReadyAt(ctx, port, func() string { return fmt.Sprintf("http://127.0.0.1:%d/", port) })
}
func (p *Process) ReadyAt(ctx context.Context, port int, address func() string) error {
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Timeout: time.Second, Jar: jar, Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true}}
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		if p.OwnsPort(port) {
			req, err := http.NewRequestWithContext(ctx, "GET", address(), nil)
			if err != nil {
				return err
			}
			r, err := client.Do(req)
			if err == nil {
				r.Body.Close()
				if r.StatusCode >= 200 && r.StatusCode < 400 {
					return nil
				}
			}
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("等待服务就绪：%w", ctx.Err())
		case <-p.done:
			return fmt.Errorf("服务未就绪即退出：%v", p.Err())
		case <-ticker.C:
		}
	}
}
