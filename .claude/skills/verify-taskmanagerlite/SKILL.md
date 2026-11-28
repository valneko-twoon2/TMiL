---
name: verify-taskmanagerlite
description: TaskManagerLite（Tauri 2 のデスクトップアプリ）を実際に起動して画面を操作し、動いた証拠（スクリーンショットと画面の文字）を残す。バックエンドや画面の変更が実アプリで動くか確かめたいとき、ブラウザだけの確認（偽のバックエンド）では足りないときに使う。
---

# TaskManagerLite を動かして確かめる

画面は 2 通りで確かめる。変更の種類で選ぶ。

| 確かめたいこと                                  | 方法                                                                                                                         | 速さ |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| 画面・操作・見た目だけ                          | 偽のバックエンド（ブラウザ）。`cd src/frontend && npm run dev:mock`（http://localhost:1420）、または `npm run test:e2e:mock` | 速い |
| バックエンド（計測・OS 操作・PowerShell）が絡む | 実アプリ（下の手順）                                                                                                         | 遅い |
| Linux の実アプリ                                | `npm run test:e2e:native`（tauri-driver と webkit2gtk-driver が要る。CI で回る）                                             | CI   |

偽のバックエンドの値は作り物なので、計測値・アイコン・ユーザー名・効率モードなどは実アプリでしか確かめられない。

## Launch（実アプリ・Windows）

1. 埋め込み版のデバッグビルドを作る（src/frontend で。数分かかる）
   `npm run tauri -- build --debug --no-bundle`
   `cargo build` や `tauri dev` で作った exe は開発サーバー（localhost:1420）を見に行き、画面が出ない。必ずこのコマンドで作る。
2. 起動・操作・片付けは `native.mjs` が 1 回でやる（下の Drive）。アプリは WebView2 のリモートデバッグ（CDP）を開き、プロファイルは一時フォルダーに分ける。

準備ができた印は、`nav button` が出ること（スクリプトが待つ）。

## Doctor

`node .claude/skills/verify-taskmanagerlite/native.mjs doctor`（何も変えない）。次を確かめる。

- Windows であること
- デバッグビルドがあること
- TaskManagerLite が動いていないこと。単一起動のプラグインがあり、二重には起動できない。動いていたら、使っている人のものかもしれないので、勝手に終了させず聞く

## Drive

`node .claude/skills/verify-taskmanagerlite/native.mjs run <ページ名> [検索語]`

- ページ名は左のナビの `title`。`プロセス` `パフォーマンス` `アプリの履歴` `スタートアップ アプリ` `ユーザー` `詳細` `サービス` `リソース モニター` `設定`
- 検索語があれば、そのページの `input[type="search"]` に入れる
- 計測が数回届くよう 3 秒待ってから撮る
- 細かい操作（タブ・チェック・右クリック）は、このスクリプトをコピーして、`tab`（Playwright の Page）に続きを書く。使う手がかり（セレクター）:
  - `nav button[title="…"]`
  - `[data-testid="process-group"]`（プロセスの行）、`detail-row`、`services-table`、`resmon-cpu` `resmon-listen` `resmon-modules`
  - リソース モニターのタブ: `button[role="tab"]`（CPU・メモリ・ディスク・ネットワーク）
  - 既存の例は `tests/e2e/native/app.test.mjs`

機能ごとの手順は [features/](features/README.md)。

## Evidence

- `test-results/verify/<時刻>-<ページ>.png`（画面）と `.txt`（画面の文字）。片付けでは消えない（`.gitignore` 済み）
- 証明の基準:
  - ボタンを押す・文字を入れるなど、利用者の操作で動かす。内部の関数やテスト用の口は使わない
  - 見た目だけでなく、副作用も確かめる（終了したプロセスが一覧から消える、設定ファイルが書かれる など）
  - 画面の文字は `.txt` で突き合わせる（`textContent` で読む。幅に収めたセルは `getText` では空になることがある）

## Cleanup

スクリプトが `finally` で、自分が起動した exe だけを終了し、一時のプロファイルを消す。名前で終了させない。途中で落ちて残ったら、PID を `Get-CimInstance Win32_Process -Filter "Name='taskmanagerlite.exe'"` で確かめてから、その PID だけ終了する。証拠のフォルダーは消さない。

## Helpers

- `native.mjs`（このフォルダー）: `doctor` と `run`。Playwright は `src/frontend` の `playwright-core` を使うので、先に `npm ci` が要る
- 環境変数 `VERIFY_CDP_PORT`（既定 9333）で CDP のポートを変えられる
