---
paths:
  - 'docs/**'
  - 'README.md'
  - 'CHANGELOG.md'
  - 'AGENTS.md'
---

# 文書のルール

- 日本語で、平易に短く書く。前置きやまとめの繰り返しは書かない
- 表と箇条書きを優先する。1 文は短く
- 絵文字は使わない
- docs/ は種類ごとのフォルダーに、番号付きの名前（`01-overview.md`）で置き、フォルダーの README の表に足す。手順は `docs` スキル
- `docs/testing/03-inventory.md` は自動生成。手で編集せず `npm run docs:tests` で更新する
- CHANGELOG は「未リリース」の下に、利用者から見た変化だけを 1 行ずつ書く（追加 / 変更 / 修正）
