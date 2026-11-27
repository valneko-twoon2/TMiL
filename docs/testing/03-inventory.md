# テスト一覧

> 自動生成です。手で編集せず `npm run docs:tests` で更新してください。
> 種類の決め方は [02-tags.md](02-tags.md) を参照。

合計 **1077** 件

## 種類 × 対象

| 種類 | フロント | バック | ツール | アプリ全体 | 合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 単体（同値分割） | 193 | 155 | 73 | 0 | 421 |
| 単体（境界値） | 195 | 132 | 35 | 0 | 362 |
| 単体（回帰） | 12 | 24 | 10 | 0 | 46 |
| 単体（その他） | 0 | 24 | 0 | 0 | 24 |
| スナップショット | 24 | 1 | 0 | 0 | 25 |
| 契約 | 32 | 14 | 0 | 0 | 46 |
| プロパティベース | 30 | 12 | 0 | 0 | 42 |
| ファジング | 10 | 6 | 0 | 0 | 16 |
| 形式検証 | 0 | 21 | 0 | 0 | 21 |
| VRT | 18 | 0 | 0 | 0 | 18 |
| E2E（モック） | 49 | 0 | 0 | 0 | 49 |
| E2E（実アプリ） | 0 | 0 | 0 | 7 | 7 |
| **合計** | **563** | **389** | **118** | **7** | **1077** |

## フロントの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `src/frontend/lib/api/ipc.test.ts` | 8 | 単体（同値分割） 6 / 単体（境界値） 2 |
| `src/frontend/lib/chart/chart.test.ts` | 13 | 単体（同値分割） 7 / 単体（境界値） 6 |
| `src/frontend/lib/components/render.test.ts` | 23 | 単体（回帰） 1 / スナップショット 22 |
| `src/frontend/lib/format/format.test.ts` | 70 | 単体（同値分割） 23 / 単体（境界値） 45 / 単体（回帰） 1 / スナップショット 1 |
| `src/frontend/lib/fuzz.test.ts` | 10 | ファジング 10 |
| `src/frontend/lib/history/appHistory.test.ts` | 16 | 単体（同値分割） 6 / 単体（境界値） 9 / プロパティベース 1 |
| `src/frontend/lib/history/history.test.ts` | 12 | 単体（同値分割） 3 / 単体（境界値） 7 / 単体（回帰） 2 |
| `src/frontend/lib/menu/menu.test.ts` | 17 | 単体（同値分割） 8 / 単体（境界値） 9 |
| `src/frontend/lib/mock/backend.test.ts` | 6 | 単体（同値分割） 2 / 単体（境界値） 3 / 単体（回帰） 1 |
| `src/frontend/lib/mock/system.test.ts` | 8 | 単体（同値分割） 4 / 単体（境界値） 4 |
| `src/frontend/lib/model/contract.test.ts` | 24 | 契約 24 |
| `src/frontend/lib/model/guards.test.ts` | 24 | 単体（同値分割） 6 / 単体（境界値） 10 / 契約 8 |
| `src/frontend/lib/model/wire.test.ts` | 7 | 単体（同値分割） 4 / 単体（境界値） 2 / プロパティベース 1 |
| `src/frontend/lib/performance/resources.test.ts` | 23 | 単体（同値分割） 10 / 単体（境界値） 10 / 単体（回帰） 2 / スナップショット 1 |
| `src/frontend/lib/process/process.property.test.ts` | 8 | プロパティベース 8 |
| `src/frontend/lib/process/process.test.ts` | 42 | 単体（同値分割） 23 / 単体（境界値） 17 / プロパティベース 2 |
| `src/frontend/lib/process/processColumns.test.ts` | 20 | 単体（同値分割） 12 / 単体（境界値） 7 / プロパティベース 1 |
| `src/frontend/lib/process/processTable.test.ts` | 4 | 単体（同値分割） 2 / 単体（境界値） 2 |
| `src/frontend/lib/process/tree.test.ts` | 5 | 単体（同値分割） 2 / 単体（境界値） 3 |
| `src/frontend/lib/process/usage.test.ts` | 15 | 単体（同値分割） 7 / 単体（境界値） 4 / プロパティベース 4 |
| `src/frontend/lib/resmon/resmon.test.ts` | 20 | 単体（同値分割） 12 / 単体（境界値） 5 / プロパティベース 3 |
| `src/frontend/lib/services/services.test.ts` | 7 | 単体（同値分割） 5 / 単体（境界値） 2 |
| `src/frontend/lib/settings/settings.test.ts` | 17 | 単体（同値分割） 6 / 単体（境界値） 11 |
| `src/frontend/lib/shortcuts/shortcuts.test.ts` | 3 | 単体（同値分割） 2 / 単体（境界値） 1 |
| `src/frontend/lib/startup/startup.test.ts` | 4 | 単体（同値分割） 2 / 単体（境界値） 2 |
| `src/frontend/lib/state/icons.test.ts` | 8 | 単体（同値分割） 3 / 単体（境界値） 5 |
| `src/frontend/lib/state/monitor.test.ts` | 6 | 単体（同値分割） 2 / 単体（境界値） 1 / 単体（回帰） 3 |
| `src/frontend/lib/state/newStates.test.ts` | 13 | 単体（同値分割） 8 / 単体（境界値） 5 |
| `src/frontend/lib/state/processActions.test.ts` | 21 | 単体（同値分割） 12 / 単体（境界値） 8 / 単体（回帰） 1 |
| `src/frontend/lib/table/progressive.test.ts` | 7 | 単体（同値分割） 3 / 単体（境界値） 2 / プロパティベース 2 |
| `src/frontend/lib/table/table.test.ts` | 8 | 単体（同値分割） 5 / 単体（境界値） 2 / プロパティベース 1 |
| `src/frontend/lib/table/widths.property.test.ts` | 6 | プロパティベース 6 |
| `src/frontend/lib/table/widths.test.ts` | 13 | 単体（同値分割） 5 / 単体（境界値） 8 |
| `src/frontend/lib/users/users.test.ts` | 7 | 単体（同値分割） 3 / 単体（境界値） 3 / プロパティベース 1 |
| `src/frontend/test/config.test.ts` | 1 | 単体（回帰） 1 |
| `tests/e2e/mock/app.spec.ts` | 28 | E2E（モック） 28 |
| `tests/e2e/mock/features.spec.ts` | 21 | E2E（モック） 21 |
| `tests/vrt/pages.spec.ts` | 18 | VRT 18 |

## バックの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `backend::boundary` | 8 | 単体（境界値） 8 |
| `backend::equivalence` | 14 | 単体（同値分割） 14 |
| `backend::regression` | 7 | 単体（回帰） 7 |
| `base64::boundary` | 3 | 単体（境界値） 3 |
| `base64::equivalence` | 3 | 単体（同値分割） 3 |
| `base64::property` | 1 | プロパティベース 1 |
| `collector::boundary` | 6 | 単体（境界値） 6 |
| `collector::environment` | 3 | 単体（その他） 3 |
| `collector::equivalence` | 8 | 単体（同値分割） 8 |
| `collector::regression` | 2 | 単体（回帰） 2 |
| `collector::system` | 8 | 単体（その他） 8 |
| `connections::boundary` | 4 | 単体（境界値） 4 |
| `connections::equivalence` | 5 | 単体（同値分割） 5 |
| `connections::system` | 1 | 単体（その他） 1 |
| `contract` | 14 | 契約 14 |
| `gpu::system` | 1 | 単体（その他） 1 |
| `handles::boundary` | 3 | 単体（境界値） 3 |
| `handles::equivalence` | 5 | 単体（同値分割） 5 |
| `handles::system` | 2 | 単体（その他） 2 |
| `icons::boundary` | 5 | 単体（境界値） 5 |
| `icons::equivalence` | 3 | 単体（同値分割） 3 |
| `icons::freedesktop::boundary` | 10 | 単体（境界値） 10 |
| `icons::freedesktop::equivalence` | 8 | 単体（同値分割） 8 |
| `icons::property` | 1 | プロパティベース 1 |
| `icons::script::boundary` | 4 | 単体（境界値） 4 |
| `icons::script::equivalence` | 4 | 単体（同値分割） 4 |
| `icons::windows_load` | 1 | 単体（その他） 1 |
| `identity::boundary` | 2 | 単体（境界値） 2 |
| `identity::equivalence` | 5 | 単体（同値分割） 5 |
| `identity::system` | 1 | 単体（その他） 1 |
| `launch::boundary` | 4 | 単体（境界値） 4 |
| `launch::equivalence` | 6 | 単体（同値分割） 6 |
| `launch::property` | 1 | プロパティベース 1 |
| `machine::boundary` | 8 | 単体（境界値） 8 |
| `machine::equivalence` | 10 | 単体（同値分割） 10 |
| `machine::formal` | 6 | 形式検証 6 |
| `machine::regression` | 9 | 単体（回帰） 9 |
| `metrics::boundary` | 10 | 単体（境界値） 10 |
| `metrics::equivalence` | 5 | 単体（同値分割） 5 |
| `model::boundary` | 2 | 単体（境界値） 2 |
| `model::equivalence` | 2 | 単体（同値分割） 2 |
| `modules::boundary` | 2 | 単体（境界値） 2 |
| `modules::equivalence` | 3 | 単体（同値分割） 3 |
| `modules::system` | 1 | 単体（その他） 1 |
| `open::boundary` | 6 | 単体（境界値） 6 |
| `open::equivalence` | 6 | 単体（同値分割） 6 |
| `open::property` | 3 | プロパティベース 3 |
| `powershell::boundary` | 2 | 単体（境界値） 2 |
| `powershell::equivalence` | 2 | 単体（同値分割） 2 |
| `process_control::boundary` | 6 | 単体（境界値） 6 |
| `process_control::equivalence` | 12 | 単体（同値分割） 12 |
| `process_control::property` | 3 | プロパティベース 3 |
| `process_flags::boundary` | 2 | 単体（境界値） 2 |
| `process_flags::equivalence` | 3 | 単体（同値分割） 3 |
| `process_flags::system` | 1 | 単体（その他） 1 |
| `procfs::boundary` | 3 | 単体（境界値） 3 |
| `procfs::equivalence` | 2 | 単体（同値分割） 2 |
| `procfs::system` | 1 | 単体（その他） 1 |
| `services::boundary` | 4 | 単体（境界値） 4 |
| `services::equivalence` | 7 | 単体（同値分割） 7 |
| `services::system` | 1 | 単体（その他） 1 |
| `startup::approval::boundary` | 3 | 単体（境界値） 3 |
| `startup::approval::equivalence` | 3 | 単体（同値分割） 3 |
| `startup::boundary` | 2 | 単体（境界値） 2 |
| `startup::command::boundary` | 5 | 単体（境界値） 5 |
| `startup::command::equivalence` | 4 | 単体（同値分割） 4 |
| `startup::command::fuzz` | 1 | ファジング 1 |
| `startup::command::twice` | 1 | 単体（その他） 1 |
| `startup::desktop::boundary` | 7 | 単体（境界値） 7 |
| `startup::desktop::equivalence` | 6 | 単体（同値分割） 6 |
| `startup::desktop::first_key` | 1 | 単体（その他） 1 |
| `startup::desktop::fuzz` | 1 | ファジング 1 |
| `startup::desktop::property` | 2 | プロパティベース 2 |
| `startup::desktop::regression` | 2 | 単体（回帰） 2 |
| `startup::desktop::snapshot` | 1 | スナップショット 1 |
| `startup::equivalence` | 4 | 単体（同値分割） 4 |
| `startup::registry::boundary` | 5 | 単体（境界値） 5 |
| `startup::registry::equivalence` | 6 | 単体（同値分割） 6 |
| `startup::registry::keys` | 1 | 単体（その他） 1 |
| `startup::registry::regression` | 1 | 単体（回帰） 1 |
| `startup::win_registry::boundary` | 1 | 単体（境界値） 1 |
| `startup::win_registry::equivalence` | 2 | 単体（同値分割） 2 |
| `startup::xdg::boundary` | 5 | 単体（境界値） 5 |
| `startup::xdg::equivalence` | 6 | 単体（同値分割） 6 |
| `taskmgr::boundary` | 6 | 単体（境界値） 6 |
| `taskmgr::equivalence` | 7 | 単体（同値分割） 7 |
| `taskmgr::fuzz` | 1 | ファジング 1 |
| `taskmgr::property` | 1 | プロパティベース 1 |
| `taskmgr::regression` | 2 | 単体（回帰） 2 |
| `test_support::boundary` | 1 | 単体（境界値） 1 |
| `test_support::equivalence` | 1 | 単体（同値分割） 1 |
| `test_support::regression` | 1 | 単体（回帰） 1 |
| `tests/formal/Backend.cfg` | 6 | 形式検証 6 |
| `tests/formal/MachineConformance.cfg` | 1 | 形式検証 1 |
| `tests/formal/regressions` | 8 | 形式検証 8 |
| `tests/fuzz/fuzz_targets/command_line.rs` | 1 | ファジング 1 |
| `tests/fuzz/fuzz_targets/desktop_entry.rs` | 1 | ファジング 1 |
| `tests/fuzz/fuzz_targets/windows_quote.rs` | 1 | ファジング 1 |
| `windows_list::boundary` | 3 | 単体（境界値） 3 |
| `windows_list::equivalence` | 3 | 単体（同値分割） 3 |

## ツールの内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `scripts/lib/changelog.test.mjs` | 8 | 単体（同値分割） 4 / 単体（境界値） 4 |
| `scripts/lib/command-guard.test.mjs` | 19 | 単体（同値分割） 15 / 単体（境界値） 3 / 単体（回帰） 1 |
| `scripts/lib/commit-message.test.mjs` | 17 | 単体（同値分割） 13 / 単体（境界値） 4 |
| `scripts/lib/docs.test.mjs` | 11 | 単体（同値分割） 5 / 単体（境界値） 6 |
| `scripts/lib/e2e.test.mjs` | 2 | 単体（同値分割） 1 / 単体（回帰） 1 |
| `scripts/lib/files.test.mjs` | 8 | 単体（同値分割） 4 / 単体（境界値） 3 / 単体（回帰） 1 |
| `scripts/lib/formal.test.mjs` | 6 | 単体（同値分割） 3 / 単体（境界値） 1 / 単体（回帰） 2 |
| `scripts/lib/fuzz.test.mjs` | 10 | 単体（同値分割） 4 / 単体（境界値） 4 / 単体（回帰） 2 |
| `scripts/lib/installer.test.mjs` | 2 | 単体（同値分割） 1 / 単体（境界値） 1 |
| `scripts/lib/inventory.test.mjs` | 9 | 単体（同値分割） 6 / 単体（境界値） 3 |
| `scripts/lib/mutation.test.mjs` | 4 | 単体（同値分割） 1 / 単体（境界値） 1 / 単体（回帰） 2 |
| `scripts/lib/proc.test.mjs` | 4 | 単体（同値分割） 2 / 単体（境界値） 1 / 単体（回帰） 1 |
| `scripts/lib/related.test.mjs` | 14 | 単体（同値分割） 11 / 単体（境界値） 3 |
| `scripts/lib/tauri.test.mjs` | 2 | 単体（同値分割） 2 |
| `scripts/lib/tools.test.mjs` | 2 | 単体（同値分割） 1 / 単体（境界値） 1 |

## アプリ全体の内訳

| ファイル / モジュール | 件数 | 内訳 |
| --- | ---: | --- |
| `tests/e2e/native/app.test.mjs` | 7 | E2E（実アプリ） 7 |
