@echo off
setlocal
pushd "%~dp0"
start "" cmd /k "node auto-update.js"
start "" cmd /c "node auto-sync-7z.js"
popd
endlocal
