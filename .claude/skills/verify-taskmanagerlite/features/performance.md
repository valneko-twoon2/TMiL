# パフォーマンス（要約ビュー）

## Sub-features

- 右クリックの「要約ビュー」で、ウィンドウごと一覧だけの小さな窓（380x600）になる
- もう一度選ぶか、一覧をダブルクリックで、元の大きさ・位置に戻る

## How to get to it (user POV)

左のナビの「パフォーマンス」、左の一覧を右クリック。

## Driving it with native.mjs

`native.mjs` をコピーし、ナビを開いたあとで次を足す。

- `list = tab.getByRole('list', { name: 'リソース' })`、`list.click({ button: 'right' })`、`getByRole('menuitemcheckbox', { name: '要約ビュー(W)' }).click()`
- 大きさ: `tab.evaluate(() => [innerWidth, innerHeight])`

証明: 要約で [380, 600] になり `nav` と検索欄が消える。`list.dblclick()` で元の大きさ（既定 1040x720）に戻り、`nav` が出る。

## Gotchas

- 戻す大きさは内側の大きさで覚える。外側で覚えると、戻すたびに枠の分だけ大きくなる
- 最大化していたら、戻すときに最大化し直す
