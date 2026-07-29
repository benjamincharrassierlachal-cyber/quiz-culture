/* Intègre un lot de questions dans la banque du mode détente.
 *
 *   node tools/add-detente.js lots/gastronomie.json
 *
 * Le lot est un fichier { "theme": "...", "prefix": "gas", "questions": [ ... ] } dont les
 * questions n'ont pas d'identifiant : il est attribué ici, à la suite de ceux du même thème.
 * Rien n'est écrit tant qu'une anomalie subsiste — c'est le dernier filet avant le jeu.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var E = require(path.join(root, 'engine.js'));

var file = process.argv[2];
if (!file) { console.error('usage : node tools/add-detente.js <lot.json>'); process.exit(1); }

var bankPath = path.join(root, 'data', 'detente.json');
var bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
var lot = JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, file), 'utf8'));

var problems = [];
function bad(msg) { problems.push(msg); }

// ------------------------------------------------------------------ numérotation
var last = 0;
bank.questions.forEach(function (q) {
  var m = new RegExp('^det-' + lot.prefix + '-(\\d+)$').exec(q.id);
  if (m) last = Math.max(last, parseInt(m[1], 10));
});

var added = lot.questions.map(function (q, i) {
  var out = Object.assign({}, q);
  out.id = 'det-' + lot.prefix + '-' + ('000' + (last + i + 1)).slice(-3);
  out.theme = q.theme || lot.theme;
  return out;
});

// ------------------------------------------------------------------ contrôles
var seenId = {}, byPool = {};
bank.questions.concat(added).forEach(function (q) {
  if (seenId[q.id]) bad('identifiant en double : ' + q.id);
  seenId[q.id] = 1;
  var key = q.theme + '|' + q.difficulty;
  (byPool[key] = byPool[key] || []).push(q);
});

Object.keys(byPool).forEach(function (key) {
  var prompts = {}, answers = {};
  byPool[key].forEach(function (q) {
    var p = E.normalize(q.prompt), a = E.normalize(q.answer);
    if (prompts[p]) bad('énoncé en double dans « ' + key + ' » : ' + q.prompt);
    if (answers[a]) bad('même réponse deux fois dans « ' + key + ' » : ' + q.answer + ' (' + q.id + ')');
    prompts[p] = 1; answers[a] = 1;
  });
});

added.forEach(function (q) {
  if (!q.prompt || !q.answer) return bad('question incomplète : ' + q.id);
  if (!Array.isArray(q.distractors) || q.distractors.length !== 4) bad('il faut 4 distracteurs : ' + q.id);
  if (new Set((q.distractors || []).map(E.normalize)).size !== 4) bad('distracteurs en double : ' + q.id);
  if ([1, 2, 3].indexOf(q.difficulty) === -1) bad('difficulté 1, 2 ou 3 attendue : ' + q.id);
  if (!E.checkFree(q, q.answer)) bad('le moteur refuse la réponse canonique : ' + q.id + ' → ' + q.answer);
  (q.accepted || []).forEach(function (a) {
    if (!E.checkFree(q, a)) bad('variante refusée : ' + q.id + ' → ' + a);
  });
  (q.distractors || []).forEach(function (d) {
    if (E.checkFree(q, d)) bad('distracteur accepté comme bonne réponse : ' + q.id + ' → ' + d);
  });
  if (E.normalize(q.answer).length > 28) bad('réponse trop longue à taper : ' + q.id);
});

if (problems.length) {
  console.error('\n' + problems.length + ' anomalie(s), rien n\'a été écrit :');
  problems.slice(0, 40).forEach(function (p) { console.error('  - ' + p); });
  process.exit(1);
}

// ------------------------------------------------------------------ écriture
if (bank.themes.indexOf(added[0].theme) === -1) bank.themes.push(added[0].theme);
bank.questions = bank.questions.concat(added);
fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2)
  .replace(/\{\n\s+"id"/g, '{"id"')                       // une question par ligne, plus lisible
  .replace(/\n\s+"(theme|difficulty|prompt|answer|accepted|distractors|numeric|strict)"/g, ' "$1"')
  .replace(/\n\s+\}/g, '}') + '\n', 'utf8');

var counts = {};
bank.questions.forEach(function (q) { counts[q.theme] = (counts[q.theme] || 0) + 1; });
console.log(added.length + ' questions ajoutées en « ' + added[0].theme + ' ».');
console.log('Banque détente : ' + bank.questions.length + ' questions');
Object.keys(counts).forEach(function (t) {
  var per = [1, 2, 3].map(function (d) {
    return bank.questions.filter(function (q) { return q.theme === t && q.difficulty === d; }).length;
  });
  console.log('  ' + t + ' : ' + counts[t] + '  (facile ' + per[0] + ' · moyen ' + per[1] + ' · difficile ' + per[2] + ')');
});
