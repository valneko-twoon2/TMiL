# タスク マネージャーの置き換え（Windows）

タスクバーの右クリックメニューに、アプリが独自の項目を足す方法は用意されていません。そこで Process Explorer と同じ方法で、Windows のタスク マネージャー自体を Task Manager Lite に置き換えます。

## 仕組み

`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe` に `Debugger` 値として Task Manager Lite のパスを書きます。こうすると `taskmgr.exe` の代わりに Task Manager Lite が起動します。

- タスクバーの右クリック →「タスク マネージャー」
- Ctrl+Shift+Esc
- Ctrl+Alt+Del の画面の「タスク マネージャー」

Task Manager Lite がすでに起動していれば、そのウィンドウが前に出ます。

## 操作

入り口は 2 つあります。どちらも管理者の確認（UAC）が出ます。

- **インストール時**: Windows のインストーラーを手で動かすと、最後に「置き換えますか？」と尋ねます（既定は「いいえ」。更新のときは尋ねません）。`install.ps1` は、対話できる環境で `[y/N]` を尋ねます。尋ねずに決めるには `$env:TASKMANAGERLITE_REPLACE_TASKMGR = '1'`（置き換える）か `'0'`（置き換えない）。静かなインストール（`/S`）は、`/REPLACETASKMGR` を付けたときだけ置き換えます（`src/backend/app/nsis/hooks.nsh`）
- **あとから**: 設定タブの「Windows のタスク マネージャーを置き換える」から切り替えます。内部では `reg.exe` を管理者として起動しています。

## 注意

- Windows のインストーラーでアンインストールすると、値が Task Manager Lite を指していれば自動で消します（管理者の確認が出ます。`src/backend/app/nsis/hooks.nsh`）
- それ以外の方法で消した場合（フォルダーごと削除など）は値が残り、タスク マネージャーを開こうとしても何も起きなくなります
- 戻し忘れたときは、管理者のコマンドプロンプトで次を実行します

  ```bat
  reg delete "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\taskmgr.exe" /v Debugger /f
  ```

- 別のアプリ（Process Explorer など）が置き換え済みの場合は、画面にその旨を出します

## コード

- ロジック: `src/backend/core/src/taskmgr.rs`（どの OS でもテストできる部分と、Windows だけの部分）
- 画面: `src/frontend/lib/pages/SettingsPage.svelte`
