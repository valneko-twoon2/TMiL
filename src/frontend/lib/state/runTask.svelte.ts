// 「新しいタスクの実行」のダイアログの状態。どのページの見出しからも開けるよう、App が context で配る。
import { getContext, setContext } from 'svelte';
import type { Api } from '../api/ipc';

const KEY = Symbol('runTask');

export class RunTask {
  open = $state(false);
  command = $state('');
  admin = $state(false);
  busy = $state(false);
  error = $state<string | null>(null);
  readonly #api: Pick<Api, 'runTask'>;

  constructor(api: Pick<Api, 'runTask'>) {
    this.#api = api;
  }

  show(): void {
    this.open = true;
    this.error = null;
  }

  close(): void {
    this.open = false;
    this.error = null;
  }

  /** 入力を起動する。うまくいけば閉じ、失敗したら理由をダイアログに出したままにする。 */
  async submit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      await this.#api.runTask(this.command, this.admin);
      this.open = false;
      this.command = '';
      this.admin = false;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      this.busy = false;
    }
  }
}

/** App から配る。 */
export function provideRunTask(runTask: RunTask): void {
  setContext(KEY, runTask);
}

/** ページの見出しで受け取る（配られていなければ undefined）。 */
export function useRunTask(): RunTask | undefined {
  return getContext<RunTask | undefined>(KEY);
}
