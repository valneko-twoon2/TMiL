// スタートアップ一覧の検索と並べ替え。
import { startupLocationLabel } from '../format/labels';
import type { StartupEntry } from '../model/types';

export type StartupColumn = 'name' | 'publisher' | 'program' | 'location' | 'enabled';

/** 並べ替えに使う値。発行元は実行ファイルの会社名（`company` で引く。分からなければ空）。 */
export function startupValue(
  entry: StartupEntry,
  column: StartupColumn,
  company: (exe: string) => string = () => '',
): string {
  switch (column) {
    case 'name':
      return entry.name;
    case 'publisher':
      return company(entry.program);
    case 'program':
      return entry.program;
    case 'location':
      return startupLocationLabel(entry.location);
    case 'enabled':
      return entry.enabled ? '有効' : '無効';
  }
}

/** 名前・コマンドで絞り込む。 */
export function filterStartup(entries: readonly StartupEntry[], query: string): StartupEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...entries];
  return entries.filter((e) => e.name.toLowerCase().includes(q) || e.command.toLowerCase().includes(q));
}
