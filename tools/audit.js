/* Audit de la banque + simulation de parties aléatoires (robustesse du moteur).
 * Lancer : node tools/audit.js
 */
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var bank = require(path.join(__dirname, '..', 'data', 'questions.json'));

var problems = [];
function warn(m) { problems.push(m); }

// ---------------------------------------------------------------- contenu
var byPool = {}, byLevel = {}, ids = {}, prompts = {}, answers = {};
bank.questions.forEach(function (q) {
  if (ids[q.id]) warn('id en doublon : ' + q.id); else ids[q.id] = 1;
  var key = q.prompt.toLowerCase().replace(/\s+/g, ' ').trim();   // brut : × et + comptent
  if (prompts[key]) warn('énoncé en doublon : ' + q.id + ' ≡ ' + prompts[key]); else prompts[key] = q.id;
  if (bank.levels.indexOf(q.level) === -1) warn('classe inconnue : ' + q.id);
  if (bank.subjects.indexOf(q.subject) === -1) warn('matière inconnue : ' + q.id);
  if (q.distractors.length !== 4) warn('4 distracteurs attendus : ' + q.id);
  if (new Set(q.distractors.map(E.normalize)).size !== 4) warn('distracteurs en doublon : ' + q.id);
  if (!E.checkFree(q, q.answer)) warn('réponse canonique refusée : ' + q.id);
  q.accepted.forEach(function (a) { if (!E.checkFree(q, a)) warn('variante refusée : ' + q.id + ' (' + a + ')'); });
  q.distractors.forEach(function (d) { if (E.checkFree(q, d)) warn('distracteur accepté : ' + q.id + ' (' + d + ')'); });
  if (q.prompt.length < 12) warn('énoncé très court : ' + q.id);
  byPool[q.level + '|' + q.subject] = (byPool[q.level + '|' + q.subject] || 0) + 1;
  byLevel[q.level] = (byLevel[q.level] || 0) + 1;
  var ak = q.level + '|' + q.subject + '|' + E.normalize(q.answer);
  if (answers[ak]) warn('même réponse deux fois dans un pool : ' + q.id + ' ≡ ' + answers[ak]);
  else answers[ak] = q.id;
});

bank.levels.forEach(function (l) {
  bank.subjects.forEach(function (s) {
    var n = byPool[l + '|' + s] || 0;
    if (n < 6) warn('pool trop petit : ' + l + ' / ' + s + ' = ' + n);
  });
});

console.log('Banque : ' + bank.questions.length + ' questions, ' + bank.levels.length + ' classes, ' +
  Object.keys(byPool).length + ' pools');
console.log('Par classe : ' + bank.levels.map(function (l) { return l + ' ' + (byLevel[l] || 0); }).join(' · '));

// ---------------------------------------------------------------- simulation
var stats = { parties: 0, gagnees: 0, questions: 0, scoreMax: 0, erreurs: 0 };
for (var p = 0; p < 400; p++) {
  var g = E.createGame(bank, { seed: p });
  var guard = 0;
  while (!g.finished && guard++ < 4000) {
    var q = g.current;
    if (!q) { warn('question nulle en cours de partie (partie ' + p + ')'); break; }
    var roll = g.rng();
    var forced = E.progress(g).mcForced;
    var r;
    if (!forced && roll < 0.55) r = E.answerFree(g, roll < 0.45 ? q.answer : 'reponse fausse ' + roll);
    else if (roll < 0.9) r = E.answerMC(g, roll < 0.8 ? q.answer : q.distractors[0]);
    else r = E.timeout(g);
    if (r && r.ok === false) r = E.answerMC(g, q.answer);
    stats.questions++;
    if (g.score < 0) warn('score négatif (partie ' + p + ')');
    if (g.pointsSinceCheckpoint > g.score) warn('points en jeu > score (partie ' + p + ')');
    stats.scoreMax = Math.max(stats.scoreMax, g.score);
  }
  if (guard >= 4000) warn('partie ' + p + ' non terminée en 4000 coups');
  stats.parties++;
  if (g.levelIndex >= bank.levels.length) stats.gagnees++;
}
console.log('Simulation : ' + stats.parties + ' parties, ' + stats.questions + ' questions jouées, ' +
  stats.gagnees + ' arrivées au château, score max observé ' + stats.scoreMax);

// partie parfaite
var perfect = E.createGame(bank, { seed: 7 }), n = 0;
while (!perfect.finished && n++ < 200) {
  var res = E.answerFree(perfect, perfect.current.answer);
  if (res.ok === false) E.answerMC(perfect, perfect.current.answer);
}
console.log('Partie parfaite : ' + perfect.score + ' points en ' + perfect.log.length + ' questions');
if (perfect.score !== bank.levels.length * bank.subjects.length * 2) warn('score parfait inattendu : ' + perfect.score);

console.log(problems.length ? '\n' + problems.length + ' problème(s) :\n- ' + problems.join('\n- ')
                            : '\nAucun problème détecté.');
process.exit(problems.length ? 1 : 0);
