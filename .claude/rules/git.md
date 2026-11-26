# git の運用

## ブランチ

- 普段は develop に直接コミットして push する
- main への push・force push・フックを飛ばすオプションは使わない（Claude のフックが止める）
- develop → main の PR はリリースのときだけ（`release` スキル）

## コミット

- 作業の区切りごとにこまめにコミットし、そのまま push する。ターンの終わりに未コミット・未 push があると Stop フックが止める
- 形式: `種別(範囲): 内容`。範囲は省略可。内容は日本語で 72 文字以内
  - `feat` 機能追加 / `fix` 不具合修正 / `refactor` 動作を変えない整理 / `perf` 性能 / `test` テスト / `docs` 文書 / `style` 見た目だけ / `build` ビルド・依存 / `ci` CI / `chore` その他 / `revert` 取り消し
- 本文を書くときは 1 行目との間を空ける
- `Co-Authored-By` は付けない
- 1 コミットに目的は 1 つ。修正と機能追加を混ぜない（例: 不具合修正は `fix:`、ついでの整理は別の `refactor:`）

## 改行コード

- LF だけ。`.gitattributes` と pre-commit フックで強制している
