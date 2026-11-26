---
name: bugfix
description: TMiL の不具合を直すときの手順。再現テストを先に書き、修正し、回帰テストとして残す。不具合の修正・バグ報告への対応・テストで見つかった問題を直すときに使う。
---

# 不具合の直し方

回帰テストを入れずに直すことはしない。

## 手順

1. **再現テストを書く**
   - 直す対象のすぐ隣のテストに `regression` グループを作る（無ければ）
     - Rust: `#[cfg(test)] mod tests { mod regression { ... } }`
     - TS: `describe('regression', () => { ... })`
   - 何が起きていたかを 1 行のコメントで書く（例: 「見出しの無いファイルで、有効にしても無効のままだった」）
   - テスト名は「正しい振る舞い」を書く（例: `keys_before_any_group_do_not_override_requested_state`）
2. **失敗を確かめる**: `npm run test:related` で、そのテストが落ちることを見る
3. **直す**: 最小限の変更で直す。ついでの整理は別コミットにする
4. **通ることを確かめる**: `npm run test:related`。画面なら `-- --e2e-mock`、バックの挙動なら必要に応じて `-- --e2e-native`
5. **状態機械の不具合なら TLA+ にも残す**: 不具合を戻した版を `tests/formal/Regressions.tla` と `regressions/*.cfg`、`scripts/lib/formal.mjs` に足し、TLC が見つけることを確かめる（docs/architecture/02-state-machine.md）
6. **集計を更新**: `npm run docs:tests`
7. **コミット**: `fix: 〜の不具合を修正`。テストと修正は同じコミットでよい
8. **CHANGELOG**: 利用者に見える不具合なら「未リリース」の「修正」に 1 行足す

## 期待値が間違っていた場合

テストの期待値が間違っていて実装が正しいときは、期待値を直す。その理由をコミットメッセージの本文に書く（`test: 〜の期待値を修正` など）。
