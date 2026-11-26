# 依存関係

## 方針

- 依存は最小限にする。入れる前に「自分で書ける量か」を考える
- 今入っているもの
  - Rust: tauri・tauri-plugin-single-instance・serde・sysinfo・winreg（Windows のみ）、テスト用に insta・serde_json
  - フロント: @tauri-apps/api と、開発用のビルド・Lint・テストのツール
  - ミューテーションテストのツール（Stryker）は入れず、実行時に取得する

## Dependabot

- npm・cargo・GitHub Actions を週 1 回（月曜 9 時）
- minor と patch はまとめて 1 本の PR にする
- 宛先は develop
- Tauri のメジャー更新（3 系）は安定版が出るまで無視する
- 中身を見て、取り込まないものは閉じてよい

## 脆弱性

CI の「依存関係の監査」で確認します。結果はジョブのサマリーに出ます。

- npm audit で high 以上があれば失敗
- cargo-deny で RustSec の脆弱性があれば失敗

失敗したら、直ったバージョンに上げられるか確かめます。上げられない・影響が無い場合は、理由を書いて `deny.toml` の `ignore` に足します。
