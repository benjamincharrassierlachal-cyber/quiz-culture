/* Cherche les fonctions appelées mais jamais définies dans le script de l'interface.
 *
 *   node tools/lint.js
 *
 * Pourquoi : une réécriture de bloc peut emporter une fonction encore utilisée ailleurs.
 * Le jeu ne s'en aperçoit qu'à l'exécution, sur le clic du joueur — « graineFraiche is not
 * defined » est arrivé exactement comme ça. Ce contrôle prend une seconde et couvre tous les
 * chemins, y compris ceux que le test d'interface ne parcourt pas.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
var blocs = tpl.match(/<script>([\s\S]*?)<\/script>/g).map(function (s) {
  return s.replace(/^<script>/, '').replace(/<\/script>$/, '');
});
var ui = blocs[blocs.length - 1];

// on retire chaînes et commentaires : ils contiennent du texte qui ressemble à du code
var net = ui
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(\\.|[^'\\])*'/g, "''")
  .replace(/"(\\.|[^"\\])*"/g, '""');

var defs = {};
(net.match(/function\s+([A-Za-zÀ-ÿ_$][\w$]*)/g) || []).forEach(function (m) {
  defs[m.replace(/function\s+/, '')] = 1;
});
// var f = function () {}  et  var a = 1, f = function...
(net.match(/([A-Za-zÀ-ÿ_$][\w$]*)\s*=\s*function/g) || []).forEach(function (m) {
  defs[m.split('=')[0].trim()] = 1;
});
// paramètres et variables locales : on les accepte en bloc, le but est de trouver les oublis
(net.match(/\bvar\s+[^;]+/g) || []).forEach(function (m) {
  m.replace(/\bvar\s+/, '').split(',').forEach(function (p) {
    var n = p.split('=')[0].trim();
    if (/^[A-Za-zÀ-ÿ_$][\w$]*$/.test(n)) defs[n] = 1;
  });
});
(net.match(/function[^(]*\(([^)]*)\)/g) || []).forEach(function (m) {
  (m.match(/\(([^)]*)\)/)[1] || '').split(',').forEach(function (p) {
    var n = p.trim();
    if (n) defs[n] = 1;
  });
});

var GLOBAUX = ('E S Math JSON Object Array String Number Date Promise Boolean RegExp Error Set Map ' +
  'parseInt parseFloat isNaN isFinite setTimeout setInterval clearTimeout clearInterval ' +
  'encodeURIComponent decodeURIComponent alert confirm fetch require Uint32Array Uint8Array ' +
  'document window navigator localStorage BANK RELAX LEADERBOARD BUILD console AudioContext ' +
  'webkitAudioContext SpeechRecognition webkitSpeechRecognition URL').split(' ');
GLOBAUX.forEach(function (g) { defs[g] = 1; });

var manquantes = {};
var re = /(^|[^.\w$'"])([a-zA-ZÀ-ÿ_$][\w$]*)\s*\(/g, m;
while ((m = re.exec(net))) {
  var n = m[2];
  if (/^(if|for|while|switch|catch|function|return|typeof|new|do|else|in|of|delete|void|instanceof)$/.test(n)) continue;
  if (defs[n]) continue;
  manquantes[n] = (manquantes[n] || 0) + 1;
}

var noms = Object.keys(manquantes);
if (!noms.length) {
  console.log('Aucune fonction appelée sans être définie.');
  process.exit(0);
}
noms.forEach(function (n) {
  console.log('  MANQUANTE  ' + n + '  (' + manquantes[n] + ' appel' + (manquantes[n] > 1 ? 's' : '') + ')');
});
console.log('\n' + noms.length + ' fonction(s) appelée(s) sans définition');
process.exit(1);
