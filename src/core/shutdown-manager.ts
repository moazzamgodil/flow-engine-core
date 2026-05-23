export class ShutdownManager {
  private readonly listeners = new Set<(reason: string) => void>();
  private shuttingDown = false;

  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public triggerShutdown(reason = 'shutdown'): void {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    for (const listener of this.listeners) {
      listener(reason);
    }
  }

  public onShutdown(listener: (reason: string) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
