# リソース モニター

## Sub-features

- ネットワーク タブの待ち受けポート
- CPU タブで選んだプロセスのモジュール

## How to get to it (user POV)

左のナビの「リソース モニター」。上のタブで切り替える。

## Driving it with native.mjs

`node .claude/skills/verify-taskmanagerlite/native.mjs run リソース モニター` で画面を撮れる。タブとチェックの操作は `tests/e2e/native/app.test.mjs` の「リソース モニターで…」をコピーして使う。

証明: `[data-testid="resmon-listen"]` に行が出る。CPU の自分自身にチェックを付けると `resmon-modules` に行が出る。

## Gotchas

- 右の折れ線グラフの欄は幅を変えられる（つまみをドラッグ）
