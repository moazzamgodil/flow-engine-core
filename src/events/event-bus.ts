type EventListener<TPayload> = (payload: TPayload) => void;

export class TypedEventBus<TEventMap extends object> {
  private readonly listeners = new Map<keyof TEventMap, Set<EventListener<unknown>>>();

  public on<K extends keyof TEventMap>(event: K, listener: (payload: TEventMap[K]) => void): () => void {
    const current = this.listeners.get(event) ?? new Set<EventListener<unknown>>();
    current.add(listener as EventListener<unknown>);
    this.listeners.set(event, current);

    return () => {
      const set = this.listeners.get(event);
      if (!set) {
        return;
      }
      set.delete(listener as EventListener<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  public emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const current = this.listeners.get(event);
    if (!current) {
      return;
    }

    for (const listener of current) {
      (listener as EventListener<TEventMap[K]>)(payload);
    }
  }

  public removeAll(): void {
    this.listeners.clear();
  }
}
