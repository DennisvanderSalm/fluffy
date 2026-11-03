/**
 * Slepen én tikken met één aanraking. Geen dubbeltik, geen lang indrukken.
 * Beweegt de vinger minder dan TAP_SLOP, dan is het een tik.
 */
const TAP_SLOP = 12;

export interface DragHandlers {
  /** Mag deze aanraking nu iets doen? (bv. niet als Fluffy aan het voordoen is) */
  enabled(): boolean;
  onTap(): void;
  onDragStart(): void;
  onDragMove(x: number, y: number): void;
  onDrop(x: number, y: number): void;
}

export function attachDrag(el: HTMLElement, h: DragHandlers): void {
  let id: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;

  el.addEventListener('pointerdown', (e) => {
    if (id !== null || !h.enabled()) return;
    id = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_SLOP) {
      dragging = true;
      h.onDragStart();
    }
    if (dragging) h.onDragMove(e.clientX, e.clientY);
  });

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== id) return;
    id = null;
    if (dragging) h.onDrop(e.clientX, e.clientY);
    else if (!cancelled) h.onTap();
    dragging = false;
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
}

/** Een eenvoudige knop die reageert op een tik (pointerup binnen het element). */
export function onTap(el: HTMLElement, fn: () => void): void {
  let down = false;
  el.addEventListener('pointerdown', (e) => {
    down = true;
    e.preventDefault();
  });
  el.addEventListener('pointerleave', () => (down = false));
  el.addEventListener('pointerup', () => {
    if (down) fn();
    down = false;
  });
}
