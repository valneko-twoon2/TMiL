// プロセスのアイコンと説明・発行元の保持。知らない実行ファイルだけをまとめて問い合わせる。
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Api } from '../api/ipc';
import type { ProcessIcon } from '../model/types';
import { unknownExes } from '../process/icons';

const NOTHING = { icon: null, description: null, company: null };

export class IconStore {
  readonly #icons = new SvelteMap<string, Omit<ProcessIcon, 'exe'>>();
  readonly #pending = new SvelteSet<string>();
  readonly #api: Pick<Api, 'processIcons'>;

  constructor(api: Pick<Api, 'processIcons'>) {
    this.#api = api;
  }

  /** 画像の data URL。無ければ null、まだ分からなければ undefined。 */
  get(exe: string): string | null | undefined {
    return this.#icons.get(exe)?.icon;
  }

  /** ファイルの説明（分からなければ空）。 */
  description(exe: string): string {
    return this.#icons.get(exe)?.description ?? '';
  }

  /** 発行元（分からなければ空）。 */
  company(exe: string): string {
    return this.#icons.get(exe)?.company ?? '';
  }

  /** 知らない実行ファイルのアイコンを問い合わせる。失敗したものは「無し」として覚え、繰り返さない。 */
  async request(exes: readonly string[]): Promise<void> {
    const missing = unknownExes(exes, this.#icons, this.#pending);
    if (missing.length === 0) return;
    for (const exe of missing) this.#pending.add(exe);
    try {
      const icons = await this.#api.processIcons(missing);
      for (const { exe, ...details } of icons) this.#icons.set(exe, details);
      for (const exe of missing) if (!this.#icons.has(exe)) this.#icons.set(exe, NOTHING);
    } catch {
      for (const exe of missing) this.#icons.set(exe, NOTHING);
    } finally {
      for (const exe of missing) this.#pending.delete(exe);
    }
  }
}
