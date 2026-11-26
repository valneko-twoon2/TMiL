---
paths:
  - 'src/frontend/**'
  - 'tests/e2e/**'
  - 'tests/vrt/**'
---

# フロントのルール

## Svelte 5

- runes だけを使う（`$state` `$derived` `$effect` `$props`）。`export let`・`$:`・ストア（`writable`）は使わない
- イベントは `onclick={...}` の形。`on:click` は使わない
- `<script lang="ts">` を必ず付ける
- 繰り返しには必ずキーを付ける（`{#each items as item (item.id)}`）
- 状態を持つクラスは `lib/state/*.svelte.ts` に置く

## 構成

- 計算・整形・並べ替えなどは `lib/` の `.ts` に純粋関数として書き、テストする。`.svelte` は表示に徹する
- バックエンドは `lib/api/ipc.ts` 経由で呼ぶ。`invoke` を直接使わない。受け取った値は `model/guards.ts` で検証される
- 型を変えたら `model/types.ts`・`model/guards.ts`・契約の見本をそろえる
- UI ライブラリやアイコンライブラリは入れない。アイコンは `components/Icon.svelte` に SVG のパスを足す
- 色は `app.css` の CSS 変数を使う（ライト・ダーク両対応のため）

## 画面

- 文言は日本語。本家のタスク マネージャーの言い回しに寄せる
- ボタンには `type="button"`、アイコンだけのボタンには `aria-label` を付ける
- E2E で触る要素には `data-testid` か、役割と名前で取れるようにする

## テスト

- 単体テストは対象の隣に `*.test.ts`。`describe` を種類ごとに分ける: `equivalence` `boundary` `regression` `snapshot` `contract` `fuzz`
- 画面のスナップショットは `svelte/server` の `render` で描いた HTML を比べる（`components/render.test.ts`）
- 契約の見本を読むときは `src/frontend/test/fixtures.ts` を使う
- 画面を変えたら `npm run test:related -- --e2e-mock` も回す。見た目が変わるなら VRT の基準画像を更新する（Actions の「VRT 基準画像の更新」→ `npm run vrt:pull` → コミット。docs/testing/strategy.md）
