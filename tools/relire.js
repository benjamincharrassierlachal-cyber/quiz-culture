/* Sort un thème du mode détente sous forme lisible, pour relecture humaine.
 *
 *   node tools/relire.js Gastronomie
 *
 * Produit relecture/<theme>.md : énoncé, bonne réponse en gras, propositions, par palier.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var bank = JSON.parse(fs.readFileSync(path.join(root, 'data', 'detente.json'), 'utf8'));

var wanted = process.argv.slice(2).join(' ');
if (!wanted) { console.error('usage : node tools/relire.js <thème>'); process.exit(1); }

var theme = bank.themes.filter(function (t) {
  return t.toLowerCase() === wanted.toLowerCase();
})[0];
if (!theme) { console.error('thème inconnu. Disponibles : ' + bank.themes.join(', ')); process.exit(1); }

var LEVELS = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
var out = ['# ' + theme + ' — relecture', '',
  'Réponse attendue en **gras**. Les quatre autres propositions n\'apparaissent qu\'en choix multiple.', ''];

[1, 2, 3].forEach(function (d) {
  var list = bank.questions.filter(function (q) { return q.theme === theme && q.difficulty === d; });
  out.push('## ' + LEVELS[d] + ' (' + list.length + ')', '');
  list.forEach(function (q, i) {
    out.push((i + 1) + '. ' + q.prompt);
    out.push('   → **' + q.answer + '**  ·  ' + q.distractors.join(' · '));
  });
  out.push('');
});

fs.mkdirSync(path.join(root, 'relecture'), { recursive: true });
var file = path.join(root, 'relecture', theme.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md');
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('écrit : ' + path.relative(root, file));
