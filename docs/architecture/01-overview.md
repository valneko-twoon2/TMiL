# 全体の構成

TMiL は Tauri 2 のデスクトップアプリです。画面は Svelte 5、処理は Rust で書いています。

```
src/
├── frontend/           画面（Svelte 5 + TypeScript）。npm のパッケージ
│   ├── package.json    依存と npm のコマンド（node_modules もここにできる）
│   ├── *.config.*      Vite・Vitest・Svelte・ESLint・Playwright・Stryker の設定
│   ├── App.svelte      画面全体の枠
│   └── lib/
│       ├── api/        バックエンド呼び出し（受け取った値を検証する）
│       ├── model/      型と検証関数（契約）
│       ├── pages/      各タブの画面
│       ├── components/ 共通の部品
│       ├── state/      定期更新・設定などの状態（runes）
│       ├── mock/       E2E・VRT 用の偽バックエンド
│       └── ...         整形・並べ替え・グラフ計算などの純粋関数
├── installer/          リリースから入れるスクリプト（install.ps1・install.sh）
└── backend/            Cargo のワークスペース
    ├── Cargo.toml      ワークスペース・Lint・ビルドの設定（target/ もここにできる）
    ├── *.toml          clippy・rustfmt・cargo-deny の設定（.cargo/ に cargo-mutants）
    ├── core/           tmil-core: 状態機械・システム情報の取得・スタートアップ管理（Tauri に依存しない）
    └── app/            tmil: Tauri 本体。コマンドの受け渡し・トレイ・ウィンドウ
tests/                  E2E・VRT・契約の見本・cargo-fuzz・TLA+（formal/）。tsconfig.json は TypeScript のテスト用
scripts/                開発用スクリプト（種類ごとにフォルダー分け。Node だけで動く）
docs/                   ドキュメント
assets/                 ロゴ（画面の public フォルダーも兼ねる）
```

設定ファイルは、それぞれの層（`src/frontend`・`src/backend`・`tests`）に置いています。リポジトリ直下にあるのは、全体に効くもの（`.editorconfig`・`.gitattributes`・`.gitignore`・Prettier の設定）だけです。

- npm のコマンドは `src/frontend` で、cargo のコマンドは `src/backend` で実行します
- `scripts/` からは、どこで実行しても正しい場所で動きます（`scripts/lib/proc.mjs` の `FRONTEND`・`BACKEND`）
- Tauri の CLI は `scripts/dev/tauri.mjs` 経由で呼びます（設定とフロントの場所を環境変数で教えるため）

## 方針

- バックエンドの判断は状態機械（`machine::step`）に集め、TLA+ で検証する（[02-state-machine.md](02-state-machine.md)）
- 処理はできるだけ純粋関数にしてテストしやすくする。画面（`.svelte`）とアプリ本体（`app`）は薄く保つ
- OS ごとの違いは `core` に閉じ込める。Windows 専用の処理も、ロジックは trait 越しにどの OS でもテストできるようにする（例: `startup/registry.rs`）
- 軽さを優先する。ウィンドウが隠れている間（トレイ常駐中）は計測を止める
- Windows では WebView2 の GPU 処理を止めている（`tauri.conf.json` の `additionalBrowserArgs` の `--disable-gpu`）。グラフは SVG なので見た目は変わらず、専有メモリが約 100MB 減る（252MB → 149MB、手元の計測）

## データの流れ

1. 画面が一定間隔で `snapshot` コマンドを呼ぶ（既定 1 秒。設定で変更・一時停止できる）
2. 状態機械が、計測するか直前の結果を返すかを決める。計測するときは `Collector` が sysinfo で CPU・メモリ・ディスク・ネットワーク・プロセスを取る
3. フロントは受け取った値を `model/guards.ts` で検証してから使う
4. グラフ用の履歴（60 回分）はフロント側で持つ

## トレイ常駐

- 閉じるボタンではウィンドウを隠すだけ。終了はトレイのメニューから
- 隠したときと出したときに `window-visibility` イベントを送り、画面側が計測を止めたり再開したりする
- 2 つ目の起動は既存のウィンドウを前に出す（single-instance）
