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
var portailCss = fs.readFileSync(path.join(dir, 'portail.css'), 'utf8');   // animation du portail
var portailJs = fs.readFileSync(path.join(dir, 'portail.js'), 'utf8');
var data = fs.readFileSync(path.join(dir, 'data/questions.json'), 'utf8');
var relax = fs.readFileSync(path.join(dir, 'data/detente.json'), 'utf8');
var board = fs.readFileSync(path.join(dir, 'data/leaderboard.json'), 'utf8');
var bank = JSON.parse(data);            // garde-fous : on ne construit pas avec un JSON cassé
var relaxBank = JSON.parse(relax);
JSON.parse(board);

var stampDate = new Date().toISOString().slice(0, 10);
var stamp = JSON.stringify({
  version: crypto.createHash('sha1').update(tpl + engine + scores + portailCss + portailJs + data + relax).digest('hex').slice(0, 7),
  date: new Date().toISOString().slice(0, 16).replace('T', ' ')
});

var html = tpl
  .replace('/*__BUILD__*/', function () { return stamp; })
  .replace('/*__ENGINE__*/', function () { return engine; })
  .replace('/*__SCORES__*/', function () { return scores; })
  .replace('/*__PORTAIL_CSS__*/', function () { return portailCss; })
  .replace('/*__PORTAIL_JS__*/', function () { return portailJs; })
  .replace('/*__DATA__*/', function () { return data; })
  .replace('/*__RELAX__*/', function () { return relax; })
  .replace('/*__LEADERBOARD__*/', function () { return board; });

['__ENGINE__', '__SCORES__', '__PORTAIL_CSS__', '__PORTAIL_JS__', '__DATA__', '__RELAX__', '__LEADERBOARD__', '__BUILD__'].forEach(function (m) {
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
  name: 'Quizz Culture Générale & BAC',   // titre repris par Bubblewrap et par le Play Store
  short_name: 'Quizz du BAC',             // nom affiché sous l'icône : court, sinon tronqué
  description: 'Quizz de culture générale : partez du CP et décrochez le BAC. Jouable hors ligne.',
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
  '  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-64.png",\n' +
  '  "./img/bac.jpg", "./img/detente.jpg", "./img/defi.jpg",\n' +
  '  "./img/classe.jpg", "./img/monde.jpg", "./img/personnage.png", "./img/vortex.png",\n' +
  '  "./img/defier.jpg", "./img/relever.jpg",\n' +
  '  "./img/continuer.jpg", "./img/reprendre.jpg", "./img/publier.jpg",\n' +
  '  "./img/recommencer.jpg", "./img/abandonner.jpg", "./img/carte.jpg"];\n' +
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

// illustrations des tuiles de l'accueil : copiées près du prototype ET dans web/
['img'].forEach(function (d) {
  var src = path.join(dir, 'assets', d);
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, path.join(webDir, d), { recursive: true });
  fs.cpSync(src, path.join(dir, d), { recursive: true });
});
fs.mkdirSync(path.join(webDir, 'icons'), { recursive: true });
fs.writeFileSync(path.join(webDir, 'index.html'), webHtml);
fs.writeFileSync(path.join(webDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(webDir, 'sw.js'), sw);
// page de confidentialité : exigée par les stores, et honnête envers les joueurs
var privacy = '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Le Quizz du BAC — Confidentialité</title>' +
  '<style>body{max-width:38rem;margin:2rem auto;padding:0 1rem;font:16px/1.6 -apple-system,' +
  'BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#2a2140}h1{font-size:1.6rem}' +
  'h2{font-size:1.1rem;margin-top:2rem}code{background:#f3f0fa;padding:.1rem .3rem;border-radius:4px}' +
  '</style></head><body>' +
  '<h1>Confidentialité — Le Quizz du BAC</h1>' +
  '<p>Dernière mise à jour : ' + stampDate + '.</p>' +
  '<h2>Ce que le jeu enregistre sur votre appareil</h2>' +
  '<p>Le pseudo que vous choisissez, votre numéro de joueur, vos scores, la partie en cours et la ' +
  'liste des questions déjà vues. Ces informations restent dans le navigateur (stockage local) et ' +
  'peuvent être effacées à tout moment en vidant les données du site.</p>' +
  '<h2>Ce qui est envoyé en ligne</h2>' +
  '<p>Uniquement si le classement en ligne est activé, et uniquement quand vous publiez un score : ' +
  'le pseudo, le numéro de joueur, le score, le mode de jeu, la classe atteinte et le temps de jeu. ' +
  'Ces données sont stockées chez Supabase (hébergement en Europe) et servent exclusivement à ' +
  'afficher le classement.</p>' +
  '<h2>Ce que le jeu ne fait pas</h2>' +
  '<p>Aucun compte, aucun mot de passe, aucune adresse e-mail, aucun numéro de téléphone, aucune ' +
  'donnée de localisation. Aucune publicité, aucun traqueur, aucun partage avec des tiers. Le ' +
  'micro n\'est utilisé que si vous appuyez sur le bouton de dictée, et la reconnaissance vocale ' +
  'est celle de votre téléphone.</p>' +
  '<h2>Âge des joueurs</h2>' +
  '<p>Le jeu s\'adresse au grand public : ses questions vont du niveau primaire au niveau du ' +
  'baccalauréat, mais il n\'est pas conçu spécifiquement pour les enfants et ne leur est pas ' +
  'destiné en priorité. Il ne demande ni inscription ni donnée personnelle : un pseudo librement ' +
  'choisi suffit à jouer et à figurer au classement.</p>' +
  '<h2>Supprimer ses données</h2>' +
  '<p>Effacer les données du site supprime tout ce qui est stocké sur l\'appareil. Pour retirer un ' +
  'score publié du classement en ligne, écrivez à <a href="mailto:quizzdubac@gmail.com">' +
  'quizzdubac@gmail.com</a>.</p>' +
  '<h2>Éditeur</h2>' +
  '<p>B1JAM1C — contact : <a href="mailto:quizzdubac@gmail.com">quizzdubac@gmail.com</a>.</p>' +
  '</body></html>\n';
fs.writeFileSync(path.join(webDir, 'confidentialite.html'), privacy);

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
