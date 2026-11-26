# テストの方針

## 種類

| 種類                     | フロント                        | バック                            | 置き場所                                               |
| ------------------------ | ------------------------------- | --------------------------------- | ------------------------------------------------------ |
| 単体（同値分割・境界値） | Vitest                          | cargo test                        | 対象のすぐ隣（`*.test.ts` / `#[cfg(test)] mod tests`） |
| 回帰                     | Vitest                          | cargo test                        | 同上の `regression`                                    |
| スナップショット         | Vitest（サーバー描画した HTML） | insta                             | 同上の `snapshot`                                      |
| 契約                     | Vitest                          | cargo test                        | `tests/contract/fixtures` と各側のテスト               |
| ファジング               | fast-check                      | cargo-fuzz と簡易版（`mod fuzz`） | `src/frontend/lib/fuzz.test.ts` / `tests/fuzz`         |
| VRT                      | Playwright                      | -                                 | `tests/vrt`                                            |
| E2E（モック）            | Playwright                      | -                                 | `tests/e2e/mock`                                       |
| E2E（実アプリ）          | tauri-driver + WebDriver        | ← 両方                            | `tests/e2e/native`                                     |
| ミューテーション         | Stryker                         | cargo-mutants                     | 設定だけ（手動で回す）                                 |

分類の付け方は [tags.md](tags.md)、件数は [inventory.md](inventory.md) を見てください。

## いつ何を回すか

| 場面                     | 回すもの                                                 |
| ------------------------ | -------------------------------------------------------- |
| コードを変えたとき       | `npm run test:related`（変更に関係するテストだけ）       |
| 画面を変えたとき         | 上に加えて `--e2e-mock`（見た目が変わるなら `--vrt` も） |
| バックの挙動を変えたとき | 上に加えて必要なら `--e2e-native`                        |
| PR                       | CI が全部（ミューテーション以外）を並列で回す            |

E2E は遅いので、毎回は回しません。

## 不具合を直したら回帰テストを入れる（必須）

直した不具合が戻ってこないよう、必ず回帰テストを足します。

1. 不具合を再現するテストを先に書き、失敗することを確かめる
2. 直してテストが通ることを確かめる
3. テストは `regression` に入れ、何が起きていたかを 1 行のコメントで残す

```rust
mod regression {
    /// 見出しの無いファイルにある切り替えキーが残り、有効にしても無効のままだった。
    #[test]
    fn keys_before_any_group_do_not_override_requested_state() { ... }
}
```

```ts
describe('regression', () => {
  // hooksPath を読むだけのコマンドでも && の & を値とみなして止めていた
  it('hooksPath を読むだけのコマンドに && が続いても通す', () => { ... });
});
```

## カバレッジ

- フロント: `src/frontend/lib` の `.ts`（`.svelte.ts` とモックは除く）で 80% 以上
- バック: `tmil-core` で行 80% 以上
- 画面（`.svelte`）と Tauri 本体（`app`）は薄く保ち、スナップショットと E2E で確かめる

## VRT の基準画像

フォントの違いで OS ごとに見た目が変わるため、基準画像は Linux（CI）で作ったものだけを使います。Windows で回して作られた `*-win32.png` は git に入りません。

画面を意図して変えたら、次の手順で基準画像を作り直します。

1. 変更を push してから、GitHub Actions の「VRT 基準画像の更新」を同じブランチで実行する（`gh workflow run vrt-update.yml --ref develop`）
2. 終わったら手元で `npm run vrt:pull` を実行して取り込む
3. 差分を確かめて `test: VRT の基準画像を更新` でコミットし、push する

Actions から直接コミットしないのは、そのコミットに CI が走らず PR の必須チェックが止まるためです。

## ミューテーションテスト

準備だけしてあり、CI では回しません。

```sh
npm run test:mutation -- --backend    # cargo-mutants
npm run test:mutation -- --frontend   # Stryker
```
