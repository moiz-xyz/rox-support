type Listener = (...args: any[]) => void;

/** Minimal typed event emitter (no Node dependency, works in browsers and React Native). */
export class Emitter<Events extends Record<string, (...args: any[]) => void>> {
  private listeners = new Map<keyof Events, Set<Listener>>();

  on<K extends keyof Events>(event: K, fn: Events[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn as Listener);
    this.listeners.set(event, set);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: Events[K]) {
    this.listeners.get(event)?.delete(fn as Listener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[rox-support] listener for ${String(event)} threw`, e);
      }
    }
  }

  removeAllListeners() {
    this.listeners.clear();
  }
}
