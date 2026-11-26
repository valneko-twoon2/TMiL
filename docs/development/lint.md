# Lint

`npm run lint` で全部、`npm run lint:fix` で自動修正します。目安は 30 秒以内です（Rust の初回ビルドを除く）。

コードを変えると Claude のフックがそのファイルの整形と Lint を自動で回し、コミット時に git フックがもう一度確かめます。

## Rust

- rustfmt（`rustfmt.toml`）
- clippy: `pedantic` と、`restriction` から選んだもの（`unwrap_used`・`expect_used`・`panic`・`indexing_slicing`・`print_stdout` など）。設定は `Cargo.toml` の `[workspace.lints]`
- テストの中では `unwrap` などを許可（`clippy.toml`）
- `unsafe` は禁止
- 警告もエラー扱い（`-D warnings`）

## フロント

- ESLint: `typescript-eslint` の `strictTypeChecked` と `stylisticTypeChecked`、`eslint-plugin-svelte`。設定は `eslint.config.js`
- svelte-check（型検査。警告もエラー扱い）
- Prettier（`.prettierrc.json`）
- Svelte は runes 構文だけを使う（`svelte.config.js` で強制）

## 無効化するとき

基本は直す。どうしても必要なら理由を書く。

```ts
// eslint-disable-next-line ルール名 -- 理由
```

```rust
#[expect(clippy::ルール名, reason = "理由")]
```
