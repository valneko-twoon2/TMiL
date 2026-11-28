# PR レビュー

- レビューは PR のときだけ行う（作業ごとにはしない）
- 対象はソースコードだけ（`src/` の本体）。テスト・ドキュメント・設定は見ない
- CI が回っている間に、Claude Code の `/code-review` で行う
- 結果はテンプレートに沿って PR にコメントする

## 手順

Claude Code で `pr-review` スキルを使います（`.claude/skills/pr-review/`）。

1. PR の差分のうち、対象のファイルだけを確かめる
2. `/code-review` を PR 番号を指定して実行する
3. 結果を `.claude/skills/pr-review/template.md` の形にまとめて `gh pr comment` で投稿する

## 書き方

- 平易な文で、要点だけ。細かくなりすぎない
- 1 件につき「どこ・何が問題か・どう直すか」を 1〜2 行で
- 好みの問題は書かない
