!macro customCheckAppRunning
  DetailPrint "Closing ${PRODUCT_NAME} before installing..."
  nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /F /T`
  Pop $0
  Sleep 1000
!macroend
