---
name: release
description: TMiL のバージョンを上げて develop から main への PR を出す手順。リリース・バージョンアップ・main へのマージの準備を頼まれたときに使う。
---

# リリース PR の出し方

## 手順

1. develop が最新で、未コミットの変更が無いことを確かめる
2. `CHANGELOG.md` の「未リリース」に変更がそろっているか確かめる。足りなければ、前回のリリースからのコミット（`git log v前回..develop --oneline`）を見て足す。利用者から見た変化だけを短く
3. バージョンを決める（0.x の間は機能追加で minor、修正だけなら patch）
4. `src/frontend` で `npm run release:bump -- x.y.z`
5. 差分を確かめて `chore: vx.y.z をリリース` でコミットし、develop に push
6. PR を作る。本文は [pr-body.md](pr-body.md) の形で書く

   ```sh
   gh pr create --base main --head develop --title "chore: vx.y.z をリリース" --body-file <本文のファイル>
   ```

7. CI が回っている間に `pr-review` スキルでレビューする
8. 結果を利用者に短く伝える。マージは利用者の判断を待つ（マージするとリリースが公開される）

## マージ後

`release.yml` が Windows・Linux のインストーラーを作り、CHANGELOG の該当節を本文にしてリリースを公開する。Actions の結果を確認する。
