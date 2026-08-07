/* Audit des banques + simulation de parties aléatoires (robustesse du moteur).
 * Lancer : node tools/audit.js
 */
var path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));
var bank = require(path.join(__dirname, '..', 'data', 'questions.json'));
var relax = require(path.join(__dirname, '..', 'data', 'detente.json'));

var problems = [];
function warn(m) { problems.push(m); }

// ---------------------------------------------------------------- contenu
function auditBank(set, label, groupKey) {
  var ids = {}, prompts = {}, answers = {}, groups = {};
  set.questions.forEach(function (q) {
    if (ids[q.id]) warn(label + ' : id en doublon ' + q.id); else ids[q.id] = 1;
    var key = q.prompt.toLowerCase().replace(/\s+/g, ' ').trim();   // brut : × et + comptent
    if (prompts[key]) warn(label + ' : énoncé en doublon ' + q.id + ' ≡ ' + prompts[key]); else prompts[key] = q.id;
    if (q.distractors.length !== 4) warn(label + ' : 4 distracteurs attendus ' + q.id);
    // sur une formule, les symboles font toute la différence : on compare comme le moteur
    var norme = q.strict ? E.normalizeStrict : E.normalize;
    if (new Set(q.distractors.map(norme)).size !== 4) warn(label + ' : distracteurs en doublon ' + q.id);
    if (!E.checkFree(q, q.answer)) warn(label + ' : réponse canonique refusée ' + q.id);
    q.accepted.forEach(function (a) { if (!E.checkFree(q, a)) warn(label + ' : variante refusée ' + q.id + ' (' + a + ')'); });
    q.distractors.forEach(function (d) { if (E.checkFree(q, d)) warn(label + ' : distracteur accepté ' + q.id + ' (' + d + ')'); });
    if (q.prompt.length < 12) warn(label + ' : énoncé très court ' + q.id);
    var g = groupKey(q);
    groups[g] = (groups[g] || 0) + 1;
    var ak = g + '|' + norme(q.answer);
    if (answers[ak]) warn(label + ' : même réponse deux fois dans ' + g + ' (' + q.id + ' ≡ ' + answers[ak] + ')');
    else answers[ak] = q.id;
  });
  return groups;
}

var pools = auditBank(bank, 'BAC', function (q) { return q.level + ' / ' + q.subject; });
var themes = auditBank(relax, 'Détente', function (q) { return q.theme + ' / niveau ' + (q.difficulty || 2); });

Object.keys(pools).forEach(function (k) { if (pools[k] < 6) warn('pool trop petit : ' + k + ' = ' + pools[k]); });
[1, 2, 3].forEach(function (t) {
  var n = relax.questions.filter(function (q) { return q.difficulty === t; }).length;
  if (n < 10) warn('détente : seulement ' + n + ' questions de difficulté ' + t + ' (10 minimum)');
});

var byLevel = {};
bank.questions.forEach(function (q) { byLevel[q.level] = (byLevel[q.level] || 0) + 1; });
console.log('Mode BAC : ' + bank.questions.length + ' questions, ' + bank.levels.length + ' classes, ' +
  Object.keys(pools).length + ' pools, score parfait ' + E.maxScore(bank));
console.log('Par classe : ' + bank.levels.map(function (l) { return l + ' ' + (byLevel[l] || 0); }).join(' · '));
console.log('Mode détente : ' + relax.questions.length + ' questions, ' + Object.keys(themes).length + ' couples thème/niveau');

// ---------------------------------------------------------------- simulation mode BAC
var stats = { parties: 0, gagnees: 0, questions: 0, scoreMax: 0, demotions: 0 };
for (var p = 0; p < 400; p++) {
  var g = E.createGame(bank, { seed: p });
  var guard = 0;
  while (!g.finished && guard++ < 6000) {
    var q = g.current;
    if (!q) { warn('question nulle en cours de partie (partie ' + p + ')'); break; }
    var roll = g.rng();
    var r;
    if (!E.progress(g).mcForced && roll < 0.55) r = E.answerFree(g, roll < 0.45 ? q.answer : 'reponse fausse ' + roll);
    else if (roll < 0.9) r = E.answerMC(g, roll < 0.82 ? q.answer : q.distractors[0]);
    else r = E.timeout(g);
    if (r && r.ok === false) r = E.answerMC(g, q.answer);
    if (r && r.demoted) stats.demotions++;
    stats.questions++;
    if (g.score < 0) warn('score négatif (partie ' + p + ')');
    if (g.lives < 1 || g.lives > 20) warn('nombre de cœurs anormal : ' + g.lives + ' (partie ' + p + ')');
    if (g.pointsSinceCheckpoint > g.score) warn('points en jeu > score (partie ' + p + ')');
    stats.scoreMax = Math.max(stats.scoreMax, g.score);
  }
  if (guard >= 6000) warn('partie ' + p + ' non terminée en 6000 coups');
  stats.parties++;
  if (g.won) stats.gagnees++;
}
console.log('Simulation BAC : ' + stats.parties + ' parties, ' + stats.questions + ' questions, ' +
  stats.gagnees + ' BAC obtenus, ' + stats.demotions + ' rétrogradations, score max observé ' + stats.scoreMax);

// ---------------------------------------------------------------- simulation mode détente
var rStats = { parties: 0, questions: 0, scoreMax: 0 };
for (p = 0; p < 200; p++) {
  var d = E.createRelax(relax, { seed: p });
  if (d.queue.length !== E.CONFIG.relaxQuestions) warn('détente : ' + d.queue.length + ' questions au lieu de 30');
  if (new Set(d.queue.map(function (x) { return x.id; })).size !== d.queue.length) warn('détente : doublon dans une partie');
  var guard2 = 0;
  while (!d.finished && guard2++ < 200) {
    var roll2 = d.rng();
    if (roll2 < 0.5) E.answerFree(d, roll2 < 0.3 ? d.current.answer : 'faux');
    else if (roll2 < 0.9) E.answerMC(d, roll2 < 0.7 ? d.current.answer : d.current.distractors[0]);
    else E.timeout(d);
    rStats.questions++;
    if (d.score < 0) warn('détente : score négatif');
  }
  if (!d.finished) warn('détente : partie non terminée');
  rStats.parties++;
  rStats.scoreMax = Math.max(rStats.scoreMax, d.score);
}
console.log('Simulation détente : ' + rStats.parties + ' parties, ' + rStats.questions + ' questions, score max ' + rStats.scoreMax);

// ---------------------------------------------------------------- partie parfaite
var perfect = E.createGame(bank, { seed: 7 }), n = 0;
while (!perfect.finished && n++ < 300) {
  var res = E.answerFree(perfect, perfect.current.answer);
  if (res.ok === false) E.answerMC(perfect, perfect.current.answer);
}
console.log('Partie parfaite : ' + perfect.score + ' points en ' + perfect.log.length + ' questions, ' +
  perfect.lives + ' cœurs');
if (perfect.score !== E.maxScore(bank)) warn('score parfait inattendu : ' + perfect.score + ' au lieu de ' + E.maxScore(bank));
if (!perfect.won) warn('la partie parfaite ne débouche pas sur le BAC');

console.log(problems.length ? '\n' + problems.length + ' problème(s) :\n- ' + problems.join('\n- ')
                            : '\nAucun problème détecté.');
process.exit(problems.length ? 1 : 0);
