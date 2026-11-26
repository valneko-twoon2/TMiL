# CI

ワークフローは `.github/workflows/` にあります。使う Actions は SHA で固定し、Dependabot で更新します。

## ci.yml（develop への push と PR）

すべて並列に動きます。

| ジョブ                     | 内容                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| Lint（フロント）           | Prettier・ESLint・svelte-check                                                |
| Lint（バック）             | rustfmt・clippy（警告もエラー）                                               |
| テスト（フロント・ツール） | Vitest（単体・スナップショット・契約・ファジング）。カバレッジ 80% 未満で失敗 |
| テスト（バック）           | cargo-llvm-cov。Ubuntu と Windows の両方。カバレッジ 80% 未満で失敗           |
| E2E（モック）              | Playwright                                                                    |
| VRT                        | Playwright のスクリーンショット比較                                           |
| E2E（実アプリ）            | tauri-driver + Xvfb                                                           |
| ファジング                 | cargo-fuzz を各ターゲット 30 秒                                               |
| 依存関係の監査             | npm audit（high 以上で失敗）・cargo-deny（脆弱性・ライセンス・取得元）        |

## codeql.yml

- develop / main への push、PR、毎週月曜に実行
- 対象: GitHub Actions・JavaScript/TypeScript・Rust
- クエリ: `security-and-quality`
- 見つかったものは全部直す

## release.yml

main に push されたら、`package.json` のバージョンでリリースを作ります。詳しくは [../release/release.md](../release/release.md)。

## vrt-update.yml

VRT の基準画像を Linux で作り直し、成果物として置きます（手動実行）。取り込みは手元で `npm run vrt:pull`。

## main のブランチ保護

main への変更は PR だけです。PR では次がすべて通っている必要があります。

- ci.yml の全ジョブ
- CodeQL（3 言語）と、コードスキャンで high 以上の警告が無いこと
