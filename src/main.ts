import './styles.css';
import { App } from './core/ui/app';
import { Updates } from './core/update';
import { DOMAINS } from './domains';

const updates = new Updates();
const app = new App(document.getElementById('app')!, DOMAINS, updates);
app.start();

// Offline: alleen in de gebouwde versie (de dev-server heeft geen sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    updates.register('./sw.js').catch(() => undefined);
  });
}
