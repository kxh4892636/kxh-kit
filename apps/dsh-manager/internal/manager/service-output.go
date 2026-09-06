package manager

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var ansi = regexp.MustCompile("\\x1b\\[[0-?]*[ -/]*[@-~]")
var tokenQuery = regexp.MustCompile("([?&]token=)[^\\s&]+")

type serviceOutput struct {
	manager *Manager
	port    int
	pending string
	discard bool
}

func (w *serviceOutput) Write(b []byte) (int, error) {
	w.pending += string(b)
	for {
		end := strings.IndexByte(w.pending, '\n')
		if end < 0 {
			if len(w.pending) > 16000 {
				w.discard = true
				w.pending = ""
			}
			break
		}
		if w.discard || end > 16000 {
			w.manager.Write([]byte("[输出行过长，已省略]\n"))
		} else {
			w.line(w.pending[:end+1])
		}
		w.discard = false
		w.pending = w.pending[end+1:]
	}
	return len(b), nil
}
func (w *serviceOutput) line(line string) {
	line = ansi.ReplaceAllString(line, "")
	fields := strings.Fields(strings.TrimPrefix(line, "dsh web: "))
	if strings.HasPrefix(line, "dsh web: ") && len(fields) > 0 {
		u, e := url.Parse(fields[0])
		if e == nil && u.Scheme == "http" && u.Host == fmt.Sprintf("127.0.0.1:%d", w.port) && u.User == nil && u.Path == "/" {
			w.manager.mu.Lock()
			w.manager.address = u.String()
			w.manager.signal()
			w.manager.mu.Unlock()
		}
	}
	w.manager.Write([]byte(tokenQuery.ReplaceAllString(line, "${1}[已隐藏]")))
}
