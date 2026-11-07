/**
 * Nieuwe versies van de app. De service worker haalt een nieuwe versie op de achtergrond binnen
 * en wacht dan. De app schakelt pas over als er niet gespeeld wordt (startscherm of als Fluffy
 * slaapt): dan even herladen. Zo verandert er nooit iets midden in een sessie.
 */
export class Updates {
  private reg: ServiceWorkerRegistration | null = null;
  private listeners = new Set<() => void>();
  /**
   * Draaide deze pagina al op een eerdere versie? Bij het allereerste bezoek is er nog geen
   * versie: dan is de eerste installatie geen update, en hoeft er niets herladen te worden.
   */
  private hadVersion = false;

  async register(url: string): Promise<void> {
    const sw = navigator.serviceWorker;
    this.hadVersion = !!sw.controller;
    // Na de eerste installatie draait deze pagina op die versie; wat daarna komt is een update.
    sw.addEventListener('controllerchange', () => (this.hadVersion = true));
    this.reg = await sw.register(url);
    const watch = (w: ServiceWorker | null) => {
      if (!w) return;
      const check = () => {
        if (w.state === 'installed' && this.ready) this.listeners.forEach((fn) => fn());
      };
      check();
      w.addEventListener('statechange', check);
    };
    watch(this.reg.waiting);
    watch(this.reg.installing);
    this.reg.addEventListener('updatefound', () => watch(this.reg!.installing));
  }

  /** Staat er een nieuwe versie klaar? */
  get ready(): boolean {
    return this.hadVersion && !!this.reg?.waiting && !!navigator.serviceWorker?.controller;
  }

  onReady(fn: () => void): void {
    this.listeners.add(fn);
    if (this.ready) fn();
  }

  /** Kijk of er een nieuwe versie is (bv. als de app weer in beeld komt). */
  check(): void {
    void this.reg?.update().catch(() => undefined);
  }

  /** Overschakelen naar de nieuwe versie en herladen. */
  apply(): void {
    const w = this.reg?.waiting;
    if (!w) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    w.postMessage('activeer');
  }
}
