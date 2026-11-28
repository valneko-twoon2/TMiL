# Lint

`npm run lint` で全部、`npm run lint:fix` で自動修正します（`src/frontend` で実行）。目安は 30 秒以内です（Rust の初回ビルドを除く）。

コードを変えると Claude のフックがそのファイルの整形と Lint を自動で回し、コミット時に git フックがもう一度確かめます。

## Rust（設定は `src/backend/`）

- rustfmt（`rustfmt.toml`）
- clippy: `pedantic` と、`restriction` から選んだもの（`unwrap_used`・`expect_used`・`panic`・`indexing_slicing`・`print_stdout` など）。設定は `Cargo.toml` の `[workspace.lints]`
- テストの中では `unwrap` などを許可（`clippy.toml`）
- `unsafe` は禁止
- 警告もエラー扱い（`-D warnings`）

## フロント（設定は `src/frontend/`）

- ESLint: `typescript-eslint` の `strictTypeChecked` と `stylisticTypeChecked`、`eslint-plugin-svelte`。設定は `eslint.config.js`。`scripts/` と `tests/` の JS・TS もこの設定で検査する（パターンはリポジトリ直下が基準）
- svelte-check（型検査。警告もエラー扱い）。`tests/` の TypeScript は `tests/tsconfig.json` で別に型検査する
- Prettier（リポジトリ直下の `.prettierrc.json`。全体の Markdown・YAML も整える）
- Svelte は runes 構文だけを使う（`svelte.config.js` で強制）

## 文書

- `docs/` の置き方（番号付きの名前・各フォルダーの README）と、Markdown のリンク切れを確かめる（`scripts/docs/check-docs.mjs`）

## 無効化するとき

基本は直す。どうしても必要なら理由を書く。

```ts
// eslint-disable-next-line ルール名 -- 理由
```

```rust
#[expect(clippy::ルール名, reason = "理由")]
```
