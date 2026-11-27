import { startupLocationLabel } from '../format/labels';
import type { StartupEntry } from '../model/types';

export type StartupColumn = 'name' | 'publisher' | 'program' | 'location' | 'enabled';

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

export function filterStartup(entries: readonly StartupEntry[], query: string): StartupEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...entries];
  return entries.filter((e) => e.name.toLowerCase().includes(q) || e.command.toLowerCase().includes(q));
}
