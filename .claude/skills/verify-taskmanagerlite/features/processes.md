# プロセス

## Sub-features

- 一覧（実際のプロセス、自分自身を含む）
- 列（GPU エンジン、電力消費、分離など）
- 効率モードの葉マーク（OS の状態を反映）

## How to get to it (user POV)

起動すると最初に出る。左のナビの「プロセス」。

## Driving it with native.mjs

`node .claude/skills/verify-taskmanagerlite/native.mjs run プロセス`

証明: `.txt` に `Task Manager Lite`（自分自身。プロセス タブは実行ファイルの説明で出す）が含まれ、行が 2 つ以上ある。効率モードは、OS 側で効率モードにしたプロセス（タスク マネージャーで設定）に葉マークが付くことを `.png` で見る。

## Gotchas

- ユーザー名が空のプロセス（csrss・dwm など）は管理者で起動しないと埋まらない。空でも失敗ではない
- 値は 1 秒ごとに変わるが、行の位置は動かない
