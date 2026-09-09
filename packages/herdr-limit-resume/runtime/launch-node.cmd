#!/bin/sh
: <<'WINDOWS'
@echo off
node "%~dp0..\dist\main.mjs" %*
exit /b %ERRORLEVEL%
WINDOWS

set -u

runtime_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
main_path="$runtime_dir/../dist/main.mjs"

run_node() {
  candidate=$1
  shift
  if [ -z "$candidate" ] || [ ! -x "$candidate" ]; then
    return
  fi
  if ! "$candidate" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);' >/dev/null 2>&1; then
    return
  fi
  exec "$candidate" "$main_path" "$@"
}

run_node "$(command -v node 2>/dev/null || true)" "$@"

if [ -n "${SHELL:-}" ] && [ -x "$SHELL" ]; then
  run_node "$("$SHELL" -lic 'command -v node' 2>/dev/null || true)" "$@"
fi

for candidate in \
  "$HOME"/.nvm/versions/node/*/bin/node \
  "$HOME"/.local/share/mise/installs/node/*/bin/node \
  "$HOME"/.volta/bin/node \
  "$HOME"/.fnm/node-versions/*/installation/bin/node \
  "$HOME"/.asdf/installs/nodejs/*/bin/node \
  "$HOME/Library/Application Support/fnm/node-versions"/*/installation/bin/node
do
  run_node "$candidate" "$@"
done

printf '%s\n' 'Limit Resume requires Node.js >=22.12.0, but the Herdr server could not resolve it.' >&2
exit 127
