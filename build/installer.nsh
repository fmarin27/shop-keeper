!macro customCheckAppRunning
  DetailPrint "Closing ${PRODUCT_NAME} before installing..."
  nsExec::Exec `"$CmdPath" /C taskkill /IM "${APP_EXECUTABLE_FILENAME}" /F /T`
  Pop $0
  Sleep 1000
!macroend

!macro customInit
  ReadRegStr $R9 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${if} $R9 == "3.0.9"
  ${orIf} $R9 == "3.0.10"
  ${orIf} $R9 == "3.0.11"
  ${orIf} $R9 == "3.0.12"
    DetailPrint "Bootstrapping past legacy ${PRODUCT_NAME} uninstaller $R9..."
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  ${endIf}
!macroend
