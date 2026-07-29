/* Intègre un lot de questions dans la banque du mode BAC.
 *
 *   node tools/add-bac.js lots/bac-cp.json
 *
 * Le lot est un fichier { "level": "CP", "prefix": "cp", "questions": [ { "subject": …, … } ] }.
 * Les identifiants sont attribués ici, à la suite de ceux du même couple classe/matière.
 * Rien n'est écrit tant qu'une anomalie subsiste.
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var E = require(path.join(root, 'engine.js'));

var file = process.argv[2];
if (!file) { console.error('usage : node tools/add-bac.js <lot.json>'); process.exit(1); }

var bankPath = path.join(root, 'data', 'questions.json');
var bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
var lot = JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, file), 'utf8'));

var SUBJECT_CODE = {
  'Français': 'fr', 'Mathématiques': 'math', 'Géographie': 'geo',
  'Histoire': 'hist', 'Sciences': 'sci', 'Anglais': 'angl'
};

var problems = [];
function bad(m) { problems.push(m); }
/* Comparaison d'énoncés : on garde les chiffres et les signes, sinon « 6 + 7 » et « 6 × 7 »
   se ressembleraient une fois la ponctuation retirée. */
function promptKey(p) { return String(p).toLowerCase().replace(/\s+/g, ' ').trim(); }

if (bank.levels.indexOf(lot.level) === -1) bad('classe inconnue : ' + lot.level);

var added = lot.questions.map(function (q) {
  var code = SUBJECT_CODE[q.subject];
  if (!code) { bad('matière inconnue : ' + q.subject); code = 'x'; }
  var re = new RegExp('^' + lot.prefix + '-' + code + '-(\\d+)$');
  var last = 0;
  bank.questions.concat([]).forEach(function (x) {
    var m = re.exec(x.id);
    if (m) last = Math.max(last, parseInt(m[1], 10));
  });
  // les questions du même pool déjà ajoutées dans ce lot comptent aussi
  return { q: q, code: code, last: last };
}).map(function (item, i, all) {
  var rank = all.slice(0, i).filter(function (x) { return x.code === item.code; }).length;
  var n = item.last + rank + 1;
  return Object.assign({}, item.q, {
    id: lot.prefix + '-' + item.code + '-' + ('00' + n).slice(-3),
    level: lot.level,
    difficulty: item.q.difficulty || 1
  });
});

// ------------------------------------------------------------------ contrôles
var seenId = {}, pools = {};
bank.questions.concat(added).forEach(function (q) {
  if (seenId[q.id]) bad('identifiant en double : ' + q.id);
  seenId[q.id] = 1;
  var key = q.level + ' · ' + q.subject;
  (pools[key] = pools[key] || []).push(q);
});

// un même énoncé ne doit pas non plus se retrouver dans une autre classe
var allPrompts = {};
bank.questions.forEach(function (q) { allPrompts[promptKey(q.prompt)] = q.id; });
added.forEach(function (q) {
  var k = promptKey(q.prompt);
  if (allPrompts[k]) bad('énoncé déjà présent ailleurs (' + allPrompts[k] + ') : ' + q.prompt);
  allPrompts[k] = q.id;
});

Object.keys(pools).forEach(function (key) {
  var prompts = {}, answers = {};
  pools[key].forEach(function (q) {
    var p = promptKey(q.prompt), a = E.normalize(q.answer);
    if (prompts[p]) bad('énoncé en double dans « ' + key + ' » : ' + q.prompt);
    if (answers[a]) bad('réponse « ' + q.answer + ' » déjà utilisée dans « ' + key + ' » : ' + q.prompt);
    prompts[p] = 1; answers[a] = 1;
  });
});

added.forEach(function (q) {
  if (!q.prompt || !q.answer) return bad('question incomplète : ' + q.id);
  if (!Array.isArray(q.distractors) || q.distractors.length !== 4) bad('il faut 4 distracteurs : ' + q.id);
  if (new Set((q.distractors || []).map(E.normalize)).size !== 4) bad('distracteurs en double : ' + q.id);
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

bank.questions = bank.questions.concat(added);
fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2)
  .replace(/\{\n\s+"id"/g, '{"id"')
  .replace(/\n\s+"(level|subject|difficulty|prompt|answer|accepted|distractors|numeric|strict)"/g, ' "$1"')
  .replace(/\n\s+\}/g, '}') + '\n', 'utf8');

console.log(added.length + ' questions ajoutées en ' + lot.level + '.');
var counts = {};
bank.questions.forEach(function (q) { counts[q.level] = (counts[q.level] || 0) + 1; });
var min = 99, pool = {};
bank.questions.forEach(function (q) {
  var k = q.level + '|' + q.subject;
  pool[k] = (pool[k] || 0) + 1;
});
Object.keys(pool).forEach(function (k) { min = Math.min(min, pool[k]); });
console.log('Banque BAC : ' + bank.questions.length + ' questions · plus petit pool : ' + min);
bank.levels.forEach(function (lv) {
  if (counts[lv]) console.log('  ' + lv + ' : ' + counts[lv]);
});
