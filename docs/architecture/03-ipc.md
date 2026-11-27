# フロントとバックのやり取り（契約）

## コマンド

| コマンド                  | 引数                  | 戻り値              | 内容                                     |
| ------------------------- | --------------------- | ------------------- | ---------------------------------------- |
| `snapshot`                | なし                  | `SnapshotWire`      | 最新の計測結果（転送量を減らした形）     |
| `process_details`         | `pids`                | `ProcessDetails[]`  | プロセスの場所・コマンドライン・ユーザー |
| `system_info`             | なし                  | `SystemInfo`        | OS・CPU 名など変わらない情報             |
| `kill_processes`          | `targets`             | `KillResult[]`      | プロセスを終了（PID と起動時刻）         |
| `startup_entries`         | なし                  | `StartupEntry[]`    | スタートアップ項目                       |
| `set_startup_enabled`     | `id`, `enabled`       | `null`              | スタートアップの有効・無効               |
| `taskmgr_replacement`     | なし                  | `ReplacementStatus` | タスク マネージャー置き換えの状態        |
| `set_taskmgr_replacement` | `enabled`             | `ReplacementStatus` | 置き換えの切り替え（Windows のみ）       |
| `process_icons`           | `exes`                | `ProcessIcon[]`     | 実行ファイルのアイコン（data URL）       |
| `reveal_file`             | `path`                | `null`              | ファイルの場所を開く                     |
| `set_process_priority`    | `targets`, `priority` | `KillResult[]`      | 優先度を変える                           |
| `set_process_affinity`    | `targets`, `cpus`     | `KillResult[]`      | 関係（動かしてよい CPU）を変える         |
| `process_controls`        | `pid`                 | `ProcessControls`   | 今の優先度と関係                         |
| `search_online`           | `query`               | `null`              | 名前を Bing で検索する                   |
| `suspend_processes`       | `targets`             | `KillResult[]`      | プロセスを中断する                       |
| `resume_processes`        | `targets`             | `KillResult[]`      | 中断したプロセスを再開する               |
| `set_process_efficiency`  | `targets`, `enabled`  | `KillResult[]`      | 効率モードを入れる・外す                 |
| `run_task`                | `command`, `admin`    | `null`              | 新しいタスクを実行する                   |
| `app_windows`             | なし                  | `AppWindow[]`       | ウィンドウを出しているプロセス           |
| `switch_to_window`        | `pid`                 | `null`              | そのプロセスのウィンドウに切り替える     |
| `services`                | なし                  | `ServiceInfo[]`     | サービスの一覧                           |
| `control_service`         | `name`, `action`      | `null`              | サービスの開始・停止・再起動             |
| `open_services_tool`      | なし                  | `null`              | サービス管理ツールを開く（Windows のみ） |
| `network_connections`     | なし                  | `Connection[]`      | TCP の接続と、TCP・UDP の待ち受け        |
| `process_modules`         | `pid`                 | `ModuleInfo[]`      | プロセスが読み込んでいるモジュール       |
| `find_handles`            | `query`               | `HandleInfo[]`      | ファイルやフォルダーを開いているプロセス |
| `set_always_on_top`       | `enabled`             | `null`              | ウィンドウを常に手前に出す               |

エラーは日本語の文字列で返します。

`process_icons` は、アイコンと一緒に説明（Windows はファイルの説明、Linux は `.desktop` の `Name`）と発行元（Windows の会社名）も返し、一度調べた結果をバックで覚えます。Windows は PowerShell（System.Drawing と FileVersionInfo）、Linux は `.desktop` から探します。フロントは PNG・SVG の data URL だけを受け取ります。

`reveal_file` は実在するファイルの絶対パスだけを受け付けます（Windows はエクスプローラーで選んだ状態、Linux は入っているフォルダーを開く）。アイコンとこの操作は状態を持たないので、状態機械は通しません。

優先度・関係・中断・再開・効率モードは、終了と同じく状態機械が 1 つずつ判断します（TaskManagerLite 自身とその子孫・入れ替わったプロセスは変えない）。Windows の中断・再開・効率モードは Win32 API を PowerShell の `Add-Type`（C#）で呼びます。スクリプトに二重引用符や改行が入るので、`-EncodedCommand` で渡します。

`run_task`・`services`・`control_service`・`network_connections`・`process_modules`・`find_handles`・`app_windows`・`switch_to_window` は、利用者の操作をそのまま OS に頼むか読むだけで状態を持たないので、状態機械は通しません。入力（サービス名など）はバックで確かめ、スクリプトに埋め込まずに標準入力や引数で渡します。`search_online` は検索サイトの URL をバックで組み立て、言葉は URL エンコードして渡します。

`kill_processes` は PID と起動時刻（`startTime`）の組を受け取ります。一覧を取ってから PID が別のプロセスに再利用されていたら終了しません。TaskManagerLite 自身とその子孫（WebView）も終了しません。

## 計測結果の送り方

計測結果は毎秒送るので、転送量を減らしています（Windows はこの受け渡しもプロセスの I/O として数えるため、減らさないとディスクの列に約 200 KB/秒 と出ていました）。

- プロセスは項目名の無い配列で送る。並びは Rust の `ProcessRow` とフロントの `PROCESS_ROW_FIELDS` で同じにする
- 場所・コマンドライン・ユーザーは送らない。`lib/api/ipc.ts` が新しく出てきたプロセス（PID と起動時刻で見分ける）の分だけ `process_details` で取り、覚えておいて合わせる。場所かユーザーが空のものは 10 秒ごとに聞き直す（バックが後から補うため）
- 画面の残りの部分は、合わせたあとの `Snapshot` を使う

約 360 プロセスで、1 回あたり約 240 KB から約 50 KB になりました。

## 契約テスト

型は Rust（`src/backend/core/src/model.rs`）と TypeScript（`src/frontend/lib/model/types.ts`）の両方にあります。ずれを防ぐため、JSON の見本を間に置いています。

- `tests/contract/fixtures/*.json` が見本
- Rust 側（`src/backend/core/tests/contract.rs`）: 型を JSON にした結果が見本と一致するか
- フロント側（`src/frontend/lib/model/contract.test.ts`）: 見本を検証関数が受け取れるか、列挙値の種類が一致するか
- `snapshot-wire.json` と `process-details.json` を合わせると `snapshot.json` に戻ること（`lib/api/ipc.test.ts`）

型を変えたら次の順で直します。

1. `model.rs` を変更
2. `UPDATE_CONTRACT=1 cargo test -p taskmanagerlite-core --test contract`（`src/backend` で）で見本を作り直す
3. `types.ts` と `guards.ts` を合わせて、フロントの契約テストを通す
