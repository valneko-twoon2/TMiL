# テスト一覧

> 自動生成です。手で編集せず `npm run docs:tests` で更新してください。
> 種類の決め方は [tags.md](tags.md) を参照。

合計 **477** 件

## 種類 × 対象

| 種類 | フロント | バック | ツール | アプリ全体 | 合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 単体（同値分割） | 63 | 70 | 55 | 0 | 188 |
| 単体（境界値） | 78 | 62 | 22 | 0 | 162 |
| 単体（回帰） | 5 | 18 | 7 | 0 | 30 |
| 単体（その他） | 0 | 7 | 0 | 0 | 7 |
| スナップショット | 11 | 1 | 0 | 0 | 12 |
| 契約 | 11 | 6 | 0 | 0 | 17 |
| ファジング | 10 | 6 | 0 | 0 | 16 |
| 形式検証 | 0 | 17 | 0 | 0 | 17 |
| VRT | 10 | 0 | 0 | 0 | 10 |
| E2E（モック） | 13 | 0 | 0 | 0 | 13 |
| E2E（実アプリ） | 0 | 0 | 0 | 5 | 5 |
| **合計** | **201** | **187** | **84** | **5** | **477** |

## フロントの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `src/frontend/lib/api/ipc.test.ts` | 6 | 単体（同値分割） 4 / 単体（境界値） 2 |
| `src/frontend/lib/chart/chart.test.ts` | 13 | 単体（同値分割） 7 / 単体（境界値） 6 |
| `src/frontend/lib/components/render.test.ts` | 11 | スナップショット 11 |
| `src/frontend/lib/format/format.test.ts` | 57 | 単体（同値分割） 18 / 単体（境界値） 38 / 単体（回帰） 1 |
| `src/frontend/lib/fuzz.test.ts` | 10 | ファジング 10 |
| `src/frontend/lib/history/history.test.ts` | 11 | 単体（同値分割） 3 / 単体（境界値） 6 / 単体（回帰） 2 |
| `src/frontend/lib/model/contract.test.ts` | 11 | 契約 11 |
| `src/frontend/lib/model/guards.test.ts` | 10 | 単体（同値分割） 6 / 単体（境界値） 4 |
| `src/frontend/lib/performance/resources.test.ts` | 7 | 単体（同値分割） 3 / 単体（境界値） 4 |
| `src/frontend/lib/process/process.test.ts` | 20 | 単体（同値分割） 12 / 単体（境界値） 8 |
| `src/frontend/lib/settings/settings.test.ts` | 14 | 単体（同値分割） 6 / 単体（境界値） 8 |
| `src/frontend/lib/startup/startup.test.ts` | 3 | 単体（同値分割） 2 / 単体（境界値） 1 |
| `src/frontend/lib/state/monitor.test.ts` | 5 | 単体（同値分割） 2 / 単体（境界値） 1 / 単体（回帰） 2 |
| `tests/e2e/mock/app.spec.ts` | 13 | E2E（モック） 13 |
| `tests/vrt/pages.spec.ts` | 10 | VRT 10 |

## バックの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `backend::boundary` | 5 | 単体（境界値） 5 |
| `backend::equivalence` | 9 | 単体（同値分割） 9 |
| `backend::regression` | 5 | 単体（回帰） 5 |
| `collector::boundary` | 3 | 単体（境界値） 3 |
| `collector::equivalence` | 6 | 単体（同値分割） 6 |
| `collector::regression` | 2 | 単体（回帰） 2 |
| `collector::system` | 7 | 単体（その他） 7 |
| `contract` | 6 | 契約 6 |
| `machine::boundary` | 8 | 単体（境界値） 8 |
| `machine::equivalence` | 10 | 単体（同値分割） 10 |
| `machine::formal` | 5 | 形式検証 5 |
| `machine::regression` | 7 | 単体（回帰） 7 |
| `metrics::boundary` | 10 | 単体（境界値） 10 |
| `metrics::equivalence` | 5 | 単体（同値分割） 5 |
| `model::boundary` | 2 | 単体（境界値） 2 |
| `model::equivalence` | 2 | 単体（同値分割） 2 |
| `startup::approval::boundary` | 3 | 単体（境界値） 3 |
| `startup::approval::equivalence` | 3 | 単体（同値分割） 3 |
| `startup::boundary` | 2 | 単体（境界値） 2 |
| `startup::command::boundary` | 5 | 単体（境界値） 5 |
| `startup::command::equivalence` | 4 | 単体（同値分割） 4 |
| `startup::command::fuzz` | 1 | ファジング 1 |
| `startup::desktop::boundary` | 7 | 単体（境界値） 7 |
| `startup::desktop::equivalence` | 6 | 単体（同値分割） 6 |
| `startup::desktop::fuzz` | 1 | ファジング 1 |
| `startup::desktop::regression` | 2 | 単体（回帰） 2 |
| `startup::desktop::snapshot` | 1 | スナップショット 1 |
| `startup::equivalence` | 4 | 単体（同値分割） 4 |
| `startup::registry::boundary` | 5 | 単体（境界値） 5 |
| `startup::registry::equivalence` | 6 | 単体（同値分割） 6 |
| `startup::win_registry::boundary` | 1 | 単体（境界値） 1 |
| `startup::win_registry::equivalence` | 2 | 単体（同値分割） 2 |
| `startup::xdg::boundary` | 5 | 単体（境界値） 5 |
| `startup::xdg::equivalence` | 6 | 単体（同値分割） 6 |
| `taskmgr::boundary` | 6 | 単体（境界値） 6 |
| `taskmgr::equivalence` | 7 | 単体（同値分割） 7 |
| `taskmgr::fuzz` | 1 | ファジング 1 |
| `taskmgr::regression` | 2 | 単体（回帰） 2 |
| `tests/formal/Backend.cfg` | 5 | 形式検証 5 |
| `tests/formal/MachineConformance.cfg` | 1 | 形式検証 1 |
| `tests/formal/regressions` | 6 | 形式検証 6 |
| `tests/fuzz/fuzz_targets/command_line.rs` | 1 | ファジング 1 |
| `tests/fuzz/fuzz_targets/desktop_entry.rs` | 1 | ファジング 1 |
| `tests/fuzz/fuzz_targets/windows_quote.rs` | 1 | ファジング 1 |

## ツールの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `scripts/lib/changelog.test.mjs` | 8 | 単体（同値分割） 4 / 単体（境界値） 4 |
| `scripts/lib/command-guard.test.mjs` | 19 | 単体（同値分割） 15 / 単体（境界値） 3 / 単体（回帰） 1 |
| `scripts/lib/commit-message.test.mjs` | 17 | 単体（同値分割） 13 / 単体（境界値） 4 |
| `scripts/lib/e2e.test.mjs` | 2 | 単体（同値分割） 1 / 単体（回帰） 1 |
| `scripts/lib/formal.test.mjs` | 6 | 単体（同値分割） 3 / 単体（境界値） 1 / 単体（回帰） 2 |
| `scripts/lib/fuzz.test.mjs` | 10 | 単体（同値分割） 4 / 単体（境界値） 4 / 単体（回帰） 2 |
| `scripts/lib/inventory.test.mjs` | 6 | 単体（同値分割） 4 / 単体（境界値） 2 |
| `scripts/lib/proc.test.mjs` | 4 | 単体（同値分割） 2 / 単体（境界値） 1 / 単体（回帰） 1 |
| `scripts/lib/related.test.mjs` | 12 | 単体（同値分割） 9 / 単体（境界値） 3 |

## アプリ全体の内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `tests/e2e/native/app.test.mjs` | 5 | E2E（実アプリ） 5 |
