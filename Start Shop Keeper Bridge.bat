@echo off
setlocal
cd /d "C:\Users\ferna\APPS\Business Apps\MANAGER APP\shop-floor-app-skeleton"
call "C:\Program Files\nodejs\npm.cmd" run build >nul
start "Shop Keeper Bridge" /min "C:\Program Files\nodejs\node.exe" "C:\Users\ferna\APPS\Business Apps\MANAGER APP\shop-floor-app-skeleton\dist-electron\bridge.js"
endlocal
