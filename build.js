/* Assemble template.html + engine.js + data/questions.json et produit :
 *   - prototype.html   → un seul fichier, ouvrable en double-clic (ordinateur)
 *   - web/             → version installable sur téléphone (PWA : manifeste + service worker)
 *
 * Lancer : node build.js
 */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var dir = __dirname, webDir = path.join(dir, 'web');

var tpl = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
var engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
var scores = fs.readFileSync(path.join(dir, 'scores.js'), 'utf8');
var data = fs.readFileSync(path.join(dir, 'data/questions.json'), 'utf8');
var relax = fs.readFileSync(path.join(dir, 'data/detente.json'), 'utf8');
var board = fs.readFileSync(path.join(dir, 'data/leaderboard.json'), 'utf8');
var bank = JSON.parse(data);            // garde-fous : on ne construit pas avec un JSON cassé
var relaxBank = JSON.parse(relax);
JSON.parse(board);

var stamp = JSON.stringify({
  version: crypto.createHash('sha1').update(tpl + engine + scores + data + relax).digest('hex').slice(0, 7),
  date: new Date().toISOString().slice(0, 16).replace('T', ' ')
});

var html = tpl
  .replace('/*__BUILD__*/', function () { return stamp; })
  .replace('/*__ENGINE__*/', function () { return engine; })
  .replace('/*__SCORES__*/', function () { return scores; })
  .replace('/*__DATA__*/', function () { return data; })
  .replace('/*__RELAX__*/', function () { return relax; })
  .replace('/*__LEADERBOARD__*/', function () { return board; });

['__ENGINE__', '__SCORES__', '__DATA__', '__RELAX__', '__LEADERBOARD__', '__BUILD__'].forEach(function (m) {
  if (html.indexOf(m) !== -1) {
    console.error('Injection incomplète : marqueur ' + m + ' absent du template.');
    process.exit(1);
  }
});

// ------------------------------------------------------------------ fichier unique
fs.writeFileSync(path.join(dir, 'prototype.html'), html);

// ------------------------------------------------------------------ version web installable
var version = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);

var webHtml = html.replace('<!--PWA-->',
  '<link rel="manifest" href="manifest.webmanifest">\n' +
  '<link rel="icon" href="icons/favicon-64.png">\n' +
  '<script>\n' +
  '  if ("serviceWorker" in navigator && location.protocol === "https:") {\n' +
  '    addEventListener("load", function () { navigator.serviceWorker.register("sw.js"); });\n' +
  '  }\n' +
  '</script>');

var manifest = {
  name: 'Quiz Culture',
  short_name: 'Quiz Culture',
  description: 'Quiz de culture générale, du CP au Bac. Jouable hors ligne.',
  lang: 'fr',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#fff6e3',
  theme_color: '#fff6e3',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

var sw =
  '/* Service worker : met l\'app en cache pour qu\'elle fonctionne hors ligne. */\n' +
  'var CACHE = "quiz-culture-' + version + '";\n' +
  'var FILES = ["./", "./index.html", "./manifest.webmanifest",\n' +
  '  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-64.png"];\n' +
  '\n' +
  'self.addEventListener("install", function (e) {\n' +
  '  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));\n' +
  '});\n' +
  '\n' +
  'self.addEventListener("activate", function (e) {\n' +
  '  e.waitUntil(caches.keys().then(function (keys) {\n' +
  '    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));\n' +
  '  }).then(function () { return self.clients.claim(); }));\n' +
  '});\n' +
  '\n' +
  '/* Cache d\'abord, mais UNIQUEMENT les fichiers de l\'app.\n' +
  '   Tout ce qui part vers un autre domaine (le classement en ligne) doit passer par le réseau :\n' +
  '   mis en cache, il renverrait éternellement la première réponse — et intercepté, un envoi\n' +
  '   pouvait être avalé sans que le jeu s\'en aperçoive. */\n' +
  'self.addEventListener("fetch", function (e) {\n' +
  '  if (e.request.method !== "GET") return;\n' +
  '  var url;\n' +
  '  try { url = new URL(e.request.url); } catch (err) { return; }\n' +
  '  if (url.origin !== self.location.origin) return;      // API distante : jamais de cache\n' +
  '  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {\n' +
  '    return hit || fetch(e.request).then(function (res) {\n' +
  '      var copy = res.clone();\n' +
  '      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });\n' +
  '      return res;\n' +
  '    }).catch(function () { return caches.match("./index.html"); });\n' +
  '  }));\n' +
  '});\n';

fs.mkdirSync(path.join(webDir, 'icons'), { recursive: true });
fs.writeFileSync(path.join(webDir, 'index.html'), webHtml);
fs.writeFileSync(path.join(webDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(webDir, 'sw.js'), sw);
fs.writeFileSync(path.join(webDir, '_headers'),
  '/*\n  Cache-Control: no-cache\n');          // Netlify : évite de servir une vieille version

// ------------------------------------------------------------------ copie docs/ (GitHub Pages sans Actions)
var toDocs = process.argv.indexOf('--docs') !== -1;
if (toDocs) {
  var docs = path.join(dir, 'docs');
  fs.rmSync(docs, { recursive: true, force: true });
  fs.cpSync(webDir, docs, { recursive: true });
  fs.writeFileSync(path.join(docs, '.nojekyll'), '');   // sinon GitHub ignore les dossiers en _
}

var missing = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-64.png']
  .filter(function (f) { return !fs.existsSync(path.join(webDir, 'icons', f)); });

console.log('version : ' + JSON.parse(stamp).version);
console.log('prototype.html : ' + Math.round(html.length / 1024) + ' Ko · mode BAC ' + bank.questions.length +
  ' questions sur ' + bank.levels.length + ' classes · mode détente ' + relaxBank.questions.length + ' questions.');
console.log('classement : ' + (JSON.parse(board).url ? 'Supabase configuré.' : 'local (voir SUPABASE.md).'));
console.log('web/ : version ' + version + (missing.length
  ? '\n  /!\\ icônes manquantes (' + missing.join(', ') + ') → lancer : node tools/make-icons.js'
  : ' — prêt à publier (Netlify Drop, GitHub Pages…).'));
if (toDocs) console.log('docs/ : copie de web/ pour GitHub Pages (source « /docs »).');
