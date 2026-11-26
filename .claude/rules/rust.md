---
paths:
  - 'src/backend/**'
  - 'tests/fuzz/**'
  - 'tests/formal/**'
---

# Rust のルール

## 構成

- 処理は `tmil-core`（`src/backend/core`）に書く。Tauri に依存させない
- `tmil`（`src/backend/app`）はコマンドの受け渡し・トレイ・ウィンドウだけにする。ロジックを書かない
- OS ごとの処理は `#[cfg(windows)]` などで分ける。Windows 専用でも、判断ロジックは trait 越しにどの OS でもテストできる形にする（例: `startup/registry.rs` の `RegistryStore`）

## 状態機械

- バックエンドの判断（計測するか・終了してよいか・切り替えてよいか など）は `machine::step` だけで行う。殻（`backend/`）と Tauri（`app/`）は `Effect` に従って実行するだけ
- `step` を変えたら、遷移表を作り直し（`src/backend` で `UPDATE_FORMAL=1 cargo test -p tmil-core machine::tests::formal`）、`tests/formal/BackendMachine.tla` の `Step` も同じ判断にする
- 新しい約束は `Backend.tla` の `Broken` と Rust の `machine::tests::formal` の両方に足す。不具合を直したら、その不具合を戻した版を `Regressions.tla` に足す
- ロックは「collector → machine」の順。machine のロックを持ったまま計測や UAC を待たない

## 書き方

- `unwrap`・`expect`・`panic!`・添字アクセス（`v[i]`）は本体では使わない（clippy で禁止。テストでは可）
- `unsafe` は禁止
- エラーは `Result` で返す。画面に出るエラー文は日本語で、利用者が次にどうすればよいか分かるように書く
- フロントに渡す型は `model.rs` に置き、`#[serde(rename_all = "camelCase")]` を付ける。形を変えたら契約の見本を更新する（docs/architecture/ipc.md）
- lint を無効にするときは `#[expect(..., reason = "...")]` で理由を書く

## テスト

- 単体テストは同じファイルの `#[cfg(test)] mod tests` に置き、種類ごとにサブモジュールを分ける: `equivalence` `boundary` `regression` `snapshot` `fuzz` `formal`
- 実機の値を読むテスト（sysinfo など）は値の範囲や関係を確かめる。具体的な値は決め打ちしない
- ファイルを扱うテストは `startup::test_support::TempDir` を使う
- スナップショットは insta。新しい `.snap.new` は中身を確かめてから `.snap` に変える
- 関係するテストだけ回す: `cargo test -p tmil-core <モジュール名>::`（cargo は `src/backend` で実行する。設定もそこにある）
