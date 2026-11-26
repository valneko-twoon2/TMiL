# フロントとバックのやり取り（契約）

## コマンド

| コマンド                  | 引数            | 戻り値              | 内容                               |
| ------------------------- | --------------- | ------------------- | ---------------------------------- |
| `snapshot`                | なし            | `Snapshot`          | 最新の計測結果                     |
| `system_info`             | なし            | `SystemInfo`        | OS・CPU 名など変わらない情報       |
| `kill_processes`          | `targets`       | `KillResult[]`      | プロセスを終了（PID と起動時刻）   |
| `startup_entries`         | なし            | `StartupEntry[]`    | スタートアップ項目                 |
| `set_startup_enabled`     | `id`, `enabled` | `null`              | スタートアップの有効・無効         |
| `taskmgr_replacement`     | なし            | `ReplacementStatus` | タスク マネージャー置き換えの状態  |
| `set_taskmgr_replacement` | `enabled`       | `ReplacementStatus` | 置き換えの切り替え（Windows のみ） |
| `process_icons`           | `exes`          | `ProcessIcon[]`     | 実行ファイルのアイコン（data URL） |
| `reveal_file`             | `path`          | `null`              | ファイルの場所を開く               |

エラーは日本語の文字列で返します。

`process_icons` は一度調べた結果をバックで覚えます。Windows は PowerShell（System.Drawing）、Linux は `.desktop` の `Icon` から探します。フロントは PNG・SVG の data URL だけを受け取ります。

`reveal_file` は実在するファイルの絶対パスだけを受け付けます（Windows はエクスプローラーで選んだ状態、Linux は入っているフォルダーを開く）。アイコンとこの操作は状態を持たないので、状態機械は通しません。

`kill_processes` は PID と起動時刻（`startTime`）の組を受け取ります。一覧を取ってから PID が別のプロセスに再利用されていたら終了しません。TMiL 自身とその子孫（WebView）も終了しません。

## 契約テスト

型は Rust（`src/backend/core/src/model.rs`）と TypeScript（`src/frontend/lib/model/types.ts`）の両方にあります。ずれを防ぐため、JSON の見本を間に置いています。

- `tests/contract/fixtures/*.json` が見本
- Rust 側（`src/backend/core/tests/contract.rs`）: 型を JSON にした結果が見本と一致するか
- フロント側（`src/frontend/lib/model/contract.test.ts`）: 見本を検証関数が受け取れるか、列挙値の種類が一致するか

型を変えたら次の順で直します。

1. `model.rs` を変更
2. `UPDATE_CONTRACT=1 cargo test -p tmil-core --test contract`（`src/backend` で）で見本を作り直す
3. `types.ts` と `guards.ts` を合わせて、フロントの契約テストを通す
