# AGENTS.md

TMiL は Rust + Tauri 2 + Svelte 5 で作る軽量タスクマネージャーです（Windows と Linux）。画面の構成は Windows 11 のタスク マネージャーに寄せています。

全体の構成は [docs/architecture/overview.md](docs/architecture/overview.md)、細かいルールは `.claude/rules/` にあります（Claude Code は自動で読み込みます。ほかのエージェントも作業する場所に応じて読んでください）。

## 必ず守ること

1. **日本語で書く**: 返答・コミット・PR・レビュー・ドキュメント・コメント。変数名などの識別子は英語
2. **平易に短く**: 細かくなりすぎない。要点だけ
3. **こまめにコミットする**: 形式は `種別: 内容`（日本語）。`Co-Authored-By` は付けない。develop に直接コミットして push する
4. **main は触らない**: バージョンを上げるときだけ develop → main の PR を出す
5. **LF だけ使う**
6. **Lint を通す**: 編集するたびにフックが整形と Lint を回す。無効化は理由を書いて最小限に
7. **不具合を直したら回帰テストを入れる**（重要）: 先に再現テストを書いてから直す。手順は `bugfix` スキル
8. **テストは関係するものから**: 普段は `npm run test:related`。全部は CI に任せる
9. **依存を増やさない**: 必要なときは理由を説明してから
10. **レビューは PR のときだけ**: 作業ごとにはしない。対象はソースコードだけ

## コマンド

| コマンド                                   | 内容                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| `npm run tauri dev`                        | アプリを起動                                          |
| `npm run dev:mock`                         | ブラウザで画面だけ確認（偽のバックエンド）            |
| `npm run lint` / `npm run lint:fix`        | Lint / 自動修正                                       |
| `npm run test:related`                     | 変更に関係するテスト（`-- --e2e-mock` などで E2E も） |
| `npm test`                                 | テストを並列で全部（ミューテーション以外）            |
| `npm run test:front` / `npm run test:back` | フロント / バックだけ                                 |
| `npm run docs:tests`                       | テスト件数の集計（docs/testing/inventory.md）を更新   |
| `npm run release:bump -- x.y.z`            | バージョンを上げる                                    |

Rust のコマンドは `scripts/` 経由で呼ぶと、rustup のプロキシが使えない環境でもツールチェーンを探して動きます。

## フォルダー

| 場所                | 内容                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `src/frontend/`     | 画面（Svelte 5）                                                                       |
| `src/backend/core/` | システム情報の取得・スタートアップ管理（Tauri 非依存。テストの中心）                   |
| `src/backend/app/`  | Tauri 本体（受け渡し・トレイ・ウィンドウだけ）                                         |
| `tests/`            | 契約の見本・E2E・VRT・cargo-fuzz                                                       |
| `scripts/`          | 開発用スクリプト（`hooks` `lint` `test` `docs` `release` `maintenance` `setup` `lib`） |
| `docs/`             | ドキュメント（目次は docs/README.md）                                                  |

## スキル（.claude/skills/）

| スキル      | 使う場面                                           |
| ----------- | -------------------------------------------------- |
| `bugfix`    | 不具合を直すとき（回帰テストの入れ方）             |
| `release`   | バージョンを上げて develop → main の PR を出すとき |
| `pr-review` | PR を出したあと、CI の間にレビューするとき         |
