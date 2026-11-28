export interface ToastMessage {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export class Toasts {
  items = $state<ToastMessage[]>([]);
  #next = 1;

  show(text: string, kind: ToastMessage['kind'] = 'info', durationMs = 5000): void {
    const id = this.#next;
    this.#next += 1;
    this.items = [...this.items, { id, text, kind }];
    setTimeout(() => {
      this.dismiss(id);
    }, durationMs);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}
