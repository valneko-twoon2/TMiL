; TMiL のインストーラー用フック（tauri.conf.json の bundle.windows.nsis.installerHooks）

; アンインストール時、タスク マネージャーの置き換え（IFEO の Debugger 値）が TMiL を指していれば消す。
; 残ったままだと Ctrl+Shift+Esc やタスクバーのメニューからタスク マネージャーが開かなくなる。
; 更新（/UPDATE）のときは同じ場所に入れ直すので消さない。
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    SetRegView 64
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe" "Debugger"
    SetRegView lastused
    ${If} $0 == '"$INSTDIR\${MAINBINARYNAME}.exe"'
      ; HKLM への書き込みには管理者権限が要るので、reg.exe を管理者として動かす
      ExecShellWait "runas" "reg.exe" 'delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe" /v Debugger /f /reg:64' SW_HIDE
    ${EndIf}
  ${EndIf}
!macroend
