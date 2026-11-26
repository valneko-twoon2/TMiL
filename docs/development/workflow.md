# ブランチ・コミット・フック

## ブランチ

- `develop`: 普段の開発はここに直接コミットして push する
- `main`: バージョンを上げるときだけ、`develop` から PR を出してマージする（直接 push は禁止）

## コミット

- こまめにコミットする（作業の区切りごと）
- 形式は `種別: 内容`。内容は日本語
  - 種別: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`
  - 例: `feat: プロセス一覧に検索を追加` / `fix(core): 起動時に落ちる不具合を修正`
- `Co-Authored-By` は付けない
- 改行コードは LF

## フック

| 種類                 | 場所                                 | 内容                                                  |
| -------------------- | ------------------------------------ | ----------------------------------------------------- |
| git `pre-commit`     | `scripts/hooks/git/pre-commit.mjs`   | CRLF の拒否、ステージしたファイルの Lint              |
| git `commit-msg`     | `scripts/hooks/git/commit-msg.mjs`   | コミットメッセージの形式・日本語・Co-Authored-By      |
| Claude `PreToolUse`  | `scripts/hooks/claude/pre-bash.mjs`  | フックの回避・force push・main への push などを止める |
| Claude `PostToolUse` | `scripts/hooks/claude/post-edit.mjs` | 編集したファイルを LF にし、整形と Lint               |
| Claude `Stop`        | `scripts/hooks/claude/stop.mjs`      | 未コミット・未 push の変更があれば止める              |

git フックは `npm install` で自動的に有効になります（`core.hooksPath=.githooks`）。フックを飛ばすオプションは使いません。

Claude のフックはコマンド文字列を見て止めるので、禁止オプションの名前を含むテキストを Bash のヒアドキュメントで書くと止まります。ドキュメントはファイル書き込みで作ってください。
