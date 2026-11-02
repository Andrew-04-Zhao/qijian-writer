!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Use native process enumeration. WMI/CIM can block indefinitely even when the
; app is not running. This hook is shared by installation and uninstallation.
!macro customCheckAppRunning
  SetDetailsPrint textonly
  DetailPrint "正在检查栖简是否已退出…"
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $0
  ${While} $0 == 0
    ${If} ${Silent}
      SetErrorLevel 2
      Quit
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "栖简仍在运行。请先正常退出栖简，再点击“重试”继续。" /SD IDCANCEL IDRETRY +2
    Quit
    nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $0
  ${EndWhile}
  ${If} $0 != 603
    MessageBox MB_OK|MB_ICONSTOP "无法确认栖简是否已退出，请稍后重新运行安装程序。（错误 $0）" /SD IDOK
    SetErrorLevel 3
    Quit
  ${EndIf}
  DetailPrint "检查完成"
  SetDetailsPrint none
!macroend
!ifndef BUILD_UNINSTALLER
Var LibraryFolder
Var LibraryPathInput

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "欢迎使用栖简"
  !define MUI_WELCOMEPAGE_TEXT "安静写作，自由整理。$\r$\n$\r$\n接下来，你可以选择程序安装位置和文稿库位置。已有的栖简文稿库可以直接继续使用。$\r$\n$\r$\n本安装包适用于 64 位 Windows。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Page custom LibraryPage LibraryPageLeave
!macroend

!macro customInit
  StrCpy $LibraryFolder "$DOCUMENTS\栖简文稿库"
  InitPluginsDir
  File /oname=$PLUGINSDIR\library-check.ps1 "${BUILD_RESOURCES_DIR}\library-check.ps1"
!macroend

Function LibraryPage
  !insertmacro MUI_HEADER_TEXT "选择文稿库" "将文字与图片，保存在你喜欢的位置"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 8u 100% 24u "文稿库与程序安装位置相互独立。你可以选择 E 盘或其他磁盘上的文件夹。"
  Pop $0
  ${NSD_CreateLabel} 0 40u 100% 12u "文稿库位置"
  Pop $0
  ${NSD_CreateDirRequest} 0 58u 78% 14u "$LibraryFolder"
  Pop $LibraryPathInput
  ${NSD_CreateBrowseButton} 81% 57u 19% 16u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 BrowseLibrary
  ${NSD_CreateLabel} 0 86u 100% 40u "请选择空文件夹，或已有的栖简文稿库。$\r$\n已有文稿将直接打开，不会被覆盖。$\r$\n含有其他文件或无效数据的文件夹不能用于安装。"
  Pop $0
  SetCtlColors $0 "667078" "transparent"
  nsDialogs::Show
FunctionEnd

Function BrowseLibrary
  ${NSD_GetText} $LibraryPathInput $LibraryFolder
  nsDialogs::SelectFolderDialog "选择文稿库文件夹" "$LibraryFolder"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $LibraryPathInput $0
  ${EndIf}
FunctionEnd

Function LibraryPageLeave
  ${NSD_GetText} $LibraryPathInput $LibraryFolder
  nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\library-check.ps1" -Folder "$LibraryFolder"'
  Pop $0
  Pop $1
  ${If} $0 == "timeout"
    StrCpy $1 "检查超时，请确认该磁盘或文件夹可以正常访问后重试。"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "此文件夹无法用作文稿库。$\r$\n$\r$\n$1$\r$\n请重新选择空文件夹或有效的栖简文稿库。"
    Abort
  ${EndIf}
FunctionEnd

!macro customInstall
  nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\library-check.ps1" -Folder "$LibraryFolder" -Output "$INSTDIR\library-selection.json"'
  Pop $0
  Pop $1
  ${If} $0 == "timeout"
    StrCpy $1 "保存超时，请确认该磁盘或文件夹可以正常访问后重试。"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONSTOP|MB_OK "文稿库设置未能保存：$\r$\n$1"
    Abort
  ${EndIf}
!macroend
!endif
