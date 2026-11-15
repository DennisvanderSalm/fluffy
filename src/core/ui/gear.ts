/**
 * Het tandwiel: twee tellen vasthouden opent het ouderdeel. Gewoon tikken opent niets (dan komt een
 * kind er niet per ongeluk in), maar de ouder ziet dan wel hoe het moet.
 */
export function holdToOpen(gear: HTMLElement, hint: HTMLElement, open: () => void): void {
  let timer = 0;
  let hintTimer = 0;
  const cancel = () => {
    clearTimeout(timer);
    gear.classList.remove('is-holding');
  };
  const release = () => {
    const short = gear.classList.contains('is-holding');
    cancel();
    if (!short) return;
    clearTimeout(hintTimer);
    hint.classList.add('is-on');
    hintTimer = window.setTimeout(() => hint.classList.remove('is-on'), 2500);
  };
  gear.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    gear.classList.add('is-holding');
    timer = window.setTimeout(() => {
      cancel();
      hint.classList.remove('is-on');
      open();
    }, 2000);
  });
  gear.addEventListener('pointerup', release);
  gear.addEventListener('pointerleave', cancel);
  gear.addEventListener('pointercancel', cancel);
}
