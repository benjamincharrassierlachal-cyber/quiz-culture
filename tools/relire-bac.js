/* Sort la banque du mode BAC sous forme lisible, pour relecture humaine.
 *
 *   node tools/relire-bac.js
 *
 * Produit trois fiches dans relecture/ : primaire, collège, lycée.
 * Chaque question apparaît avec sa réponse en gras et ses quatre propositions.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var bank = JSON.parse(fs.readFileSync(path.join(root, 'data', 'questions.json'), 'utf8'));

var CYCLES = [
  { file: 'bac-primaire', titre: 'Primaire', levels: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { file: 'bac-college', titre: 'Collège', levels: ['6ème', '5ème', '4ème', '3ème'] },
  { file: 'bac-lycee', titre: 'Lycée', levels: ['2nde', '1ère', 'Terminale'] }
];

fs.mkdirSync(path.join(root, 'relecture'), { recursive: true });

CYCLES.forEach(function (cycle) {
  var out = ['# Mode BAC — ' + cycle.titre + ' — relecture', '',
    'Réponse attendue en **gras**. Les quatre autres propositions n\'apparaissent qu\'en choix multiple.', ''];
  cycle.levels.forEach(function (lv) {
    out.push('## ' + lv, '');
    bank.subjects.forEach(function (subj) {
      var list = bank.questions.filter(function (q) { return q.level === lv && q.subject === subj; });
      if (!list.length) return;
      out.push('### ' + subj + ' (' + list.length + ')', '');
      list.forEach(function (q, i) {
        out.push((i + 1) + '. ' + q.prompt);
        out.push('   → **' + q.answer + '**  ·  ' + q.distractors.join(' · '));
      });
      out.push('');
    });
  });
  var file = path.join(root, 'relecture', cycle.file + '.md');
  fs.writeFileSync(file, out.join('\n'), 'utf8');
  console.log('écrit : ' + path.relative(root, file));
});
