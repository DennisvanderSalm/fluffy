import './styles.css';
import { App } from './core/ui/app';
import { rekenen } from './domains/rekenen';

const app = new App(document.getElementById('app')!, rekenen);
app.start();

// Offline: alleen in de gebouwde versie (de dev-server heeft geen sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
