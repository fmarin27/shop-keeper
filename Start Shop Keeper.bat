@echo off
set "NODE_DIR=C:\Program Files\nodejs"
set "PATH=%NODE_DIR%;%PATH%"
cd /d "C:\Users\ferna\APPS\Business Apps\MANAGER APP\shop-floor-app-skeleton"
call "%NODE_DIR%\npm.cmd" start
