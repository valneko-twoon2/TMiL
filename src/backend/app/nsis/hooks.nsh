; TaskManagerLite のインストーラー用フック（tauri.conf.json の bundle.windows.nsis.installerHooks）

; アンインストール時、タスク マネージャーの置き換え（IFEO の Debugger 値）が TaskManagerLite を指していれば消す。
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

; なぜ: タスクバーの右クリックの「タスク マネージャー」は OS が固定で作っていて、項目を足せない。
; 置き換えを知らずに終わらないよう、新しく入れたときにここで尋ねる（更新では尋ねない）。
; 静かなインストール（/S）では尋ねず、引数に /REPLACETASKMGR が付いているときだけ置き換える（install.ps1 が付ける）。
!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
    StrCpy $0 "no"
    ${GetParameters} $1
    ${GetOptions} $1 "/REPLACETASKMGR" $2
    ${IfNot} ${Errors}
      StrCpy $0 "yes"
    ${EndIf}
    ClearErrors
    ${If} $0 == "no"
      MessageBox MB_YESNO|MB_DEFBUTTON2 "Windows のタスク マネージャーを Task Manager Lite に置き換えますか？$\r$\nタスクバーの右クリックの「タスク マネージャー」や Ctrl+Shift+Esc で、Task Manager Lite が開くようになります。$\r$\n管理者の確認が出ます。あとから設定画面で切り替えられます。" /SD IDNO IDNO +2
      StrCpy $0 "yes"
    ${EndIf}
    ${If} $0 == "yes"
      ExecShellWait "runas" "reg.exe" 'add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe" /v Debugger /t REG_SZ /d "\"$INSTDIR\${MAINBINARYNAME}.exe\"" /f /reg:64' SW_HIDE
    ${EndIf}
  ${EndIf}
!macroend
