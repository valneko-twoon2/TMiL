---
name: docs
description: TaskManagerLite の docs/ フォルダーに文書を足す・直す・並べ替えるときの決まりと手順。ドキュメントの追加・更新、docs の構成や番号・README の目次の変更、設計や手順を書き残すときに使う。README.md・AGENTS.md・CHANGELOG.md だけを直すときは使わない。
---

# docs/ の書き方

## 置き方

```
docs/
├── README.md            フォルダーの一覧と、それぞれの大まかな説明だけ
└── <種類>/              architecture・development・testing・ci・release・features
    ├── 01-<名前>.md     読む順に番号を付ける
    ├── 02-<名前>.md
    └── README.md        このフォルダーの説明と、ファイルの一覧（表）
```

- ファイル名は「2 桁の番号-英小文字とハイフン.md」（例: `03-ipc.md`）。番号があるので README が一覧の一番下に来る
- 番号は読む順。同じフォルダーの中で重ねない
- フォルダーは 1 段だけ。`docs/` の直下には README.md 以外を置かない（画像は `docs/images/`）
- `docs/README.md` にはファイルを並べない。フォルダーへのリンクと 1 行の説明だけ
- 各フォルダーの README に、そのフォルダーのファイルを全部載せる（表: ファイル・内容）

`node scripts/docs/check-docs.mjs`（Lint にも入っている）が、置き方とリンク切れを確かめる。

## 文書を足すとき

1. どの種類か決める。合うフォルダーが無いときだけ新しいフォルダーを作る（README も作り、`docs/README.md` に足す）
2. そのフォルダーの最後の番号の次を付ける。途中に入れたいときは、後ろのファイルの番号をずらす（`git mv`）
3. フォルダーの README の表に 1 行足す
4. ほかの文書からリンクするときは、相対パスで番号付きの名前を書く（例: `[02-tags.md](../testing/02-tags.md)`）
5. `npm run lint`（`src/frontend` で）でリンク切れが無いことを確かめる

## 名前や番号を変えるとき

- `git grep` で古い名前を探し、リンクと文中の場所（`docs/testing/02-tags.md` のような書き方）を全部直す。AGENTS.md・README.md・`.claude/`・`scripts/`・コードのコメントにも出てくる
- `docs/testing/03-inventory.md` は自動生成。場所を変えたら `scripts/docs/test-inventory.mjs` と `.prettierignore`・`.gitattributes` も直す

## 書き方

- 日本語で、平易に短く。前置きやまとめの繰り返しは書かない
- 表と箇条書きを優先し、1 文は短く
- 絵文字は使わない（README も同じ）
- コマンドは、どこで実行するか（`src/frontend` か `src/backend` か）が分かるように書く
- `03-inventory.md` は手で直さない（`npm run docs:tests`）
