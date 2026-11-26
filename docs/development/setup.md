# 環境構築

## 必要なもの

- Node.js 24 以上
- Rust（stable）と clippy・rustfmt
- Linux の場合は Tauri の依存パッケージ（[公式の手順](https://v2.tauri.app/start/prerequisites/)）

テストやリリース作業で使うもの（必要になったら入れる）:

| ツール                | 用途               | 入れ方                                                           |
| --------------------- | ------------------ | ---------------------------------------------------------------- |
| cargo-llvm-cov        | バックのカバレッジ | `cargo install cargo-llvm-cov`                                   |
| tauri-driver          | 実アプリの E2E     | `cargo install tauri-driver --locked`                            |
| cargo-fuzz + nightly  | ファジング         | `cargo install cargo-fuzz` と `rustup toolchain install nightly` |
| cargo-mutants         | ミューテーション   | `cargo install cargo-mutants`                                    |
| Playwright のブラウザ | E2E（モック）・VRT | `npx playwright install chromium`                                |

## 手順

```sh
npm install          # git フック（.githooks）も自動で有効になる
npm run tauri dev    # アプリを起動
npm run dev:mock     # ブラウザだけで画面を確認（偽のバックエンド）
```

## よく使うコマンド

| コマンド                            | 内容                           |
| ----------------------------------- | ------------------------------ |
| `npm run lint` / `npm run lint:fix` | Lint（自動修正）               |
| `npm run test:related`              | 変更に関係するテストだけ       |
| `npm test`                          | テストを並列でまとめて         |
| `npm run docs:tests`                | テスト件数の集計を更新         |
| `npm run clean`                     | ビルド成果物とキャッシュを消す |

## Rust のキャッシュについて

`target/` が膨らまないよう、デバッグ情報と増分ビルドは作らない設定にしています（`Cargo.toml` の `[profile.*]`）。それでも大きくなったら `npm run clean -- --rust` で消してください。
