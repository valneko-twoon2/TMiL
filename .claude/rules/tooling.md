---
paths:
  - 'scripts/**'
  - '.githooks/**'
  - '.github/**'
  - '.claude/**'
---

# スクリプト・CI・フックのルール

## スクリプト（scripts/）

- Node.js の `.mjs` で書く。npm の依存は足さない
- 種類ごとのフォルダーに置く: `hooks/git` `hooks/claude` `lint` `test` `docs` `release` `maintenance` `setup` `dev`。共通処理とその純粋関数は `lib/`
- Windows と Linux の両方で動かす。シェルを通さず、子プロセスは `lib/proc.mjs` の `run` / `runNodeBin` で起動する
- 判断ロジックは `lib/` に純粋関数として置き、`*.test.mjs` でテストする。テストは `node:test` と `node:assert` で書く（npm の依存を使わない）
- フロント・バックの場所は `lib/proc.mjs` の `FRONTEND`・`BACKEND` を使う。npm のツールは `runNodeBin`（`src/frontend/node_modules` から探す）、cargo は `cwd: BACKEND` で動かす

## GitHub Actions（.github/）

- Actions は SHA で固定し、横にバージョンをコメントで書く
- `permissions` は最小限。既定は `contents: read`、必要なジョブだけ広げる
- `actions/checkout` は push しないなら `persist-credentials: false`
- `${{ }}` を `run:` の中に直接書かない。`env:` に入れてから使う
- CodeQL の指摘は全部直す

## フック

- git フック: `.githooks/` から `scripts/hooks/git/` を呼ぶ
- Claude のフック: `.claude/settings.json` から `scripts/hooks/claude/` を呼ぶ
- Claude の PreToolUse はコマンド文字列で判定するので、禁止オプション名を含む文章を Bash のヒアドキュメントで書くと止まる。文書はファイル書き込みで作る
