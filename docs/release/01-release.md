# リリース

## 流れ

1. develop で `CHANGELOG.md` の「未リリース」に変更を書き溜めておく
2. バージョンを上げる

   ```sh
   cd src/frontend
   npm run release:bump -- 0.2.0
   ```

   `src/frontend` の `package.json`・`package-lock.json`、`src/backend` の `Cargo.toml`・`Cargo.lock`、`CHANGELOG.md` が更新されます（`tauri.conf.json` は `src/frontend/package.json` を参照）。

3. `chore: v0.2.0 をリリース` でコミットして push
4. develop → main の PR を作る（本文はテンプレートに沿う）
5. CI と CodeQL が通り、レビューを確認したらマージ
6. main への push で `release.yml` が動く。下書きのリリースを 1 回だけ作り、Windows と Linux のインストーラーを添付してから公開する。本文は CHANGELOG の該当節そのまま
7. 公開の前に、インストール スクリプト（`src/installer/install.ps1`・`install.sh`）と、全部のファイルのハッシュ（`SHA256SUMS`）も添付する。利用者は `irm .../latest/download/install.ps1 | iex` などで入れられる

## インストール スクリプト

| ファイル                    | 使い方                            | すること                                                                |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `src/installer/install.ps1` | `irm .../install.ps1 \| iex`      | `*_x64-setup.exe` を確かめてから静かに実行（ユーザーごと）              |
| `src/installer/install.sh`  | `curl -fsSL .../install.sh \| sh` | `*_amd64.AppImage` を確かめてから `~/.local/bin` に置き、メニューに登録 |

- どちらも `SHA256SUMS` とハッシュが一致しないときは入れない
- `install.ps1` は Windows PowerShell の `irm` が Latin-1 として読むので、日本語の文は実行時に読み直している。BOM は付けない（付けると 1 行目が壊れる）
- 変えたら `npm run test:installer`（Windows では install.ps1 だけ、Linux では両方を確かめる）

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
