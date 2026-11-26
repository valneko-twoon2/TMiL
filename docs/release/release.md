# リリース

## 流れ

1. develop で `CHANGELOG.md` の「未リリース」に変更を書き溜めておく
2. バージョンを上げる

   ```sh
   npm run release:bump -- 0.2.0
   ```

   `package.json`・`package-lock.json`・`Cargo.toml`・`Cargo.lock`・`CHANGELOG.md` が更新されます（`tauri.conf.json` は `package.json` を参照）。

3. `chore: v0.2.0 をリリース` でコミットして push
4. develop → main の PR を作る（本文はテンプレートに沿う）
5. CI と CodeQL が通り、レビューを確認したらマージ
6. main への push で `release.yml` が動く。下書きのリリースを 1 回だけ作り、Windows と Linux のインストーラーを添付してから公開する。本文は CHANGELOG の該当節そのまま

## CHANGELOG の書き方

長くしない。利用者から見た変化だけを 1 行ずつ。

```md
## [未リリース]

### 追加

- 〜できるようにした

### 変更

- 〜を〜にした

### 修正

- 〜のとき〜になる不具合
```

## バージョンの付け方

- 0.x の間は、機能追加で minor、修正だけなら patch を上げる
