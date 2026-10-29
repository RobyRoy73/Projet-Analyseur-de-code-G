// Construit une version hors ligne de l'application : un seul fichier HTML,
// sans aucune ressource externe, qui s'ouvre d'un double-clic (file://).
// À lancer après `vite build` (voir le script "build" de package.json).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const OUT = 'analyseur-code-g-hors-ligne.html';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const read = (src) => {
  const path = join(dist, src.replace(/^\.?\//, ''));
  if (!existsSync(path)) throw new Error(`Ressource introuvable : ${src}`);
  return readFileSync(path, 'utf8');
};

// Polices Google : retirées, l'app utilise alors les polices du système (aucune connexion réseau).
html = html.replace(/\s*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, '');

// Feuilles de style → <style> intégré
html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>\n${read(href)}\n</style>`);

// Préchargements de modules : inutiles une fois tout intégré
html = html.replace(/\s*<link[^>]+rel="modulepreload"[^>]*>/g, '');

// Script principal → <script type="module"> intégré (fonctionne en file://, contrairement à un src externe)
html = html.replace(/<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g, (_, a, src) => {
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${code}\n</script>`;
});

if (/(src|href)="\.?\/?assets\//.test(html)) throw new Error('Des ressources externes restent dans le fichier hors ligne.');
html = html.replace('<title>', '<meta name="robots" content="noindex">\n    <title>');
writeFileSync(join(dist, OUT), html);
console.log(`Version hors ligne : dist/${OUT} (${Math.round(html.length / 1024)} Ko)`);
