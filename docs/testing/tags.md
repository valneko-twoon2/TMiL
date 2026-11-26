# テストの分類（タグ）

テスト名の途中に入れた「タグ」で種類を決め、`npm run docs:tests` が [inventory.md](inventory.md) に集計します。タグは名前の一部なので、絞り込み実行にも使えます。

## タグ

| タグ          | 種類                                     |
| ------------- | ---------------------------------------- |
| `equivalence` | 単体（同値分割）                         |
| `boundary`    | 単体（境界値）                           |
| `regression`  | 単体（回帰）                             |
| `snapshot`    | スナップショット                         |
| `contract`    | 契約                                     |
| `fuzz`        | ファジング                               |
| （なし）      | 単体（その他）。実機の値を読むテストなど |

VRT・E2E はフォルダー（Playwright のプロジェクト）で決まるので、タグは不要です。

## 付け方

Rust はモジュール名、フロントは `describe` の名前にします。

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;
        #[test]
        fn ...() {}
    }

    mod boundary { ... }
}
```

```ts
describe('formatBytes', () => {
  describe('equivalence', () => { ... });
  describe('boundary', () => { ... });
});
```

## 絞り込み実行

```sh
cargo test -p tmil-core boundary          # Rust の境界値テストだけ
npx vitest run -t "boundary"              # フロントの境界値テストだけ
npx playwright test --project=e2e-mock    # E2E（モック）だけ
```

## 対象（フロント・バックなど）の決め方

| 対象       | 条件                                     |
| ---------- | ---------------------------------------- |
| フロント   | `src/frontend` のテスト、Playwright      |
| バック     | Rust のテスト、cargo-fuzz                |
| ツール     | `scripts` のテスト（フックやスクリプト） |
| アプリ全体 | 実アプリの E2E                           |
