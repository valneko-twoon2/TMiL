# 全体の構成

TMiL は Tauri 2 のデスクトップアプリです。画面は Svelte 5、処理は Rust で書いています。

```
src/
├── frontend/           画面（Svelte 5 + TypeScript）
│   ├── App.svelte      画面全体の枠
│   └── lib/
│       ├── api/        バックエンド呼び出し（受け取った値を検証する）
│       ├── model/      型と検証関数（契約）
│       ├── pages/      各タブの画面
│       ├── components/ 共通の部品
│       ├── state/      定期更新・設定などの状態（runes）
│       ├── mock/       E2E・VRT 用の偽バックエンド
│       └── ...         整形・並べ替え・グラフ計算などの純粋関数
└── backend/
    ├── core/           tmil-core: システム情報の取得とスタートアップ管理（Tauri に依存しない）
    └── app/            tmil: Tauri 本体。コマンドの受け渡し・トレイ・ウィンドウ
tests/                  E2E・VRT・契約の見本・cargo-fuzz
scripts/                開発用スクリプト（種類ごとにフォルダー分け）
docs/                   ドキュメント
assets/                 ロゴ（画面の public フォルダーも兼ねる）
```

## 方針

- 処理はできるだけ純粋関数にしてテストしやすくする。画面（`.svelte`）とアプリ本体（`app`）は薄く保つ
- OS ごとの違いは `core` に閉じ込める。Windows 専用の処理も、ロジックは trait 越しにどの OS でもテストできるようにする（例: `startup/registry.rs`）
- 軽さを優先する。ウィンドウが隠れている間（トレイ常駐中）は計測を止める
- Windows では WebView2 の GPU 処理を止めている（`tauri.conf.json` の `additionalBrowserArgs` の `--disable-gpu`）。グラフは SVG なので見た目は変わらず、専有メモリが約 100MB 減る（252MB → 149MB、手元の計測）

## データの流れ

1. 画面が一定間隔で `snapshot` コマンドを呼ぶ（既定 1 秒。設定で変更・一時停止できる）
2. `core` の `Collector` が sysinfo で CPU・メモリ・ディスク・ネットワーク・プロセスを取る
3. フロントは受け取った値を `model/guards.ts` で検証してから使う
4. グラフ用の履歴（60 回分）はフロント側で持つ

## トレイ常駐

- 閉じるボタンではウィンドウを隠すだけ。終了はトレイのメニューから
- 隠したときと出したときに `window-visibility` イベントを送り、画面側が計測を止めたり再開したりする
- 2 つ目の起動は既存のウィンドウを前に出す（single-instance）
