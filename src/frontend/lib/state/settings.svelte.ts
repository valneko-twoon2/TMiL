// 設定の保持と保存（localStorage）。
import { parseSettings, SETTINGS_STORAGE_KEY, type Settings } from '../settings/settings';

export class SettingsStore {
  value = $state<Settings>(parseSettings(null));
  readonly #storage: Storage | undefined;

  constructor(storage: Storage | undefined) {
    this.#storage = storage;
    this.value = parseSettings(storage?.getItem(SETTINGS_STORAGE_KEY) ?? null);
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    this.#storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.value));
  }
}
