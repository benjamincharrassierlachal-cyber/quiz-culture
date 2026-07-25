/* Tests du moteur + validation de la banque de questions.
 * Lancer : node tests.js
 *
 * Règles v0.2 : 1 question par matière et par classe (5 questions par classe),
 * réponse libre 2 pts / QCM 1 pt, une réponse libre fausse impose le QCM sur la question
 * suivante, une erreur de QCM renvoie au début de la classe, timer expiré = −2 pts.
 */
var E = require('./engine.js');
var bank = require('./data/questions.json');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, name, extra) { ok(a === b, name, extra || ('attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a))); }
function section(t) { console.log('\n' + t); }

function game(opts) { return E.createGame(bank, Object.assign({ seed: 42 }, opts || {})); }
function q(s) { return s.current; }
function good(s, mode) {
  return mode === 'free' ? E.answerFree(s, s.current.answer) : E.answerMC(s, s.current.answer);
}
function badMC(s) { return E.answerMC(s, s.current.distractors[0]); }
/** Enchaîne n bonnes réponses libres en levant le QCM imposé si besoin. */
function goodRun(s, n, mode) {
  for (var i = 0; i < n; i++) {
    var r = good(s, mode || 'free');
    if (r.ok === false) r = good(s, 'mc');
  }
}

// ---------------------------------------------------------------- normalisation
section('Normalisation et réponses libres');
eq(E.normalize('  Le  Chaton !  '), 'chaton', 'articles, casse et ponctuation retirés');
eq(E.normalize("l'école"), 'ecole', 'apostrophe et accents');
eq(E.toNumber('cinquante-six'), 56, 'nombre en lettres composé');
eq(E.toNumber('en 1789'), 1789, 'nombre dans une phrase');

var qChaton = bank.questions.find(function (x) { return x.id === 'cp-fr-003'; });
ok(E.checkFree(qChaton, 'chaton'), 'réponse exacte acceptée');
ok(E.checkFree(qChaton, 'Un Chaton'), 'variante avec article acceptée');
ok(E.checkFree(qChaton, 'chatton'), 'faute de frappe tolérée (Levenshtein 1)');
ok(!E.checkFree(qChaton, 'chiot'), 'mauvaise réponse refusée');
ok(!E.checkFree(qChaton, ''), 'réponse vide refusée');

var q56 = bank.questions.find(function (x) { return x.id === 'ce2-math-001'; });
ok(E.checkFree(q56, '56'), 'réponse numérique en chiffres');
ok(E.checkFree(q56, 'cinquante-six'), 'réponse numérique en lettres');
ok(!E.checkFree(q56, '57'), 'nombre proche refusé');

var qAtl = bank.questions.find(function (x) { return x.id === 'ce1-geo-003'; });
ok(E.checkFree(qAtl, "l'océan Atlantique"), 'réponse longue avec accents et article');
ok(E.checkFree(qAtl, 'Atlantique'), 'variante courte acceptée');

section('Garde-fous de la tolérance orthographique');
var qChev = bank.questions.find(function (x) { return x.id === 'ce1-fr-002'; });
ok(E.checkFree(qChev, 'chevaux'), 'pluriel correct accepté');
ok(!E.checkFree(qChev, 'chevaus'), 'faute d\'orthographe refusée sur une question de pluriel');
var qLouis = bank.questions.find(function (x) { return x.id === 'ce1-hist-005'; });
ok(E.checkFree(qLouis, 'Louis 14'), 'chiffre arabe accepté pour Louis XIV');
ok(!E.checkFree(qLouis, 'Louis XVI'), 'Louis XVI refusé (c\'est un distracteur)');
var qColomb = bank.questions.find(function (x) { return x.id === 'ce2-hist-006'; });
ok(E.checkFree(qColomb, 'christophe colon'), 'faute de frappe tolérée sur un nom propre long');

// ---------------------------------------------------------------- structure
section('Structure : 1 question par matière, 5 matières par classe');
var s = game();
eq(s.config.questionsPerSubject, 1, 'une seule question par matière');
eq(E.progress(s).subject, bank.subjects[0], 'on démarre en Français');
eq(E.progress(s).step, 1, 'étape 1 sur 5 de la classe');
good(s, 'free');
eq(E.progress(s).subject, bank.subjects[1], 'une bonne réponse fait changer de matière');
eq(E.progress(s).step, 2, 'étape 2 sur 5');
eq(E.progress(s).level, bank.levels[0], 'toujours dans la même classe');

s = game();
goodRun(s, 5);
eq(E.progress(s).level, bank.levels[1], '5 bonnes réponses = classe suivante');
eq(E.progress(s).subject, bank.subjects[0], 'la nouvelle classe démarre en Français');
eq(s.score, 10, '5 × 2 points');
eq(s.pointsSinceCheckpoint, 0, 'palier : les points sont sécurisés');

// ---------------------------------------------------------------- scoring
section('Scoring');
s = game();
eq(good(s, 'free').points, 2, 'réponse libre correcte = 2 points');
s = game();
eq(good(s, 'mc').points, 1, 'QCM correct = 1 point');

// ---------------------------------------------------------------- réponse libre fausse
section('Réponse libre fausse : QCM imposé immédiatement');
s = game();
var before = { score: s.score, step: E.progress(s).step, id: q(s).id };
var r = E.answerFree(s, 'nimportequoi');
eq(r.correct, false, 'réponse fausse détectée');
eq(s.score, before.score, 'aucun point perdu');
eq(E.progress(s).step, before.step, 'place conservée dans la classe');
ok(q(s).id !== before.id, 'une autre question est proposée');
ok(E.progress(s).mcForced, 'le QCM est imposé dès la première erreur libre');
eq(E.answerFree(s, 'encore faux').reason, 'mcForced', 'la réponse libre est refusée');
eq(good(s, 'mc').points, 1, 'le QCM rapporte 1 point');
ok(!E.progress(s).mcForced, 'garde-fou levé après une bonne réponse');

s = game();
E.answerFree(s, 'faux');
r = badMC(s);
eq(r.correct, false, 'QCM imposé raté');
eq(E.progress(s).step, 1, 'retour au début de la classe');

// ---------------------------------------------------------------- erreur de QCM
section('Erreur de QCM : retour au début de la classe et perte des points de la classe');
s = game();
goodRun(s, 2);                       // Français + Maths → 4 pts, étape 3
eq(s.score, 4, 'score avant erreur');
eq(E.progress(s).step, 3, 'on est en Géographie');
r = badMC(s);
eq(r.lost, 4, 'points perdus depuis le dernier palier');
eq(s.score, 0, 'score remis au niveau du palier');
eq(E.progress(s).step, 1, 'retour à la 1re matière de la classe');
eq(E.progress(s).subject, bank.subjects[0], 'donc en Français');
eq(E.progress(s).level, bank.levels[0], 'la classe ne change pas');

s = game();
goodRun(s, 5);                       // classe validée, 10 pts sécurisés
goodRun(s, 2);                       // 4 pts en jeu dans la classe suivante
eq(s.score, 14, 'score cumulé sur deux classes');
r = badMC(s);
eq(r.lost, 4, 'seuls les points de la classe en cours sont perdus');
eq(s.score, 10, 'les points des classes validées sont protégés');
eq(E.progress(s).level, bank.levels[1], 'on ne redescend jamais de classe');

// ---------------------------------------------------------------- timer
section('Timer, rachat de temps et expiration');
s = game();
eq(s.timeLeft, 30, 'timer initial de 30 s');
eq(E.buyTime(s).ok, false, 'rachat impossible sans point');
good(s, 'free');                     // 2 pts
eq(E.buyTime(s).ok, true, 'rachat possible avec des points');
eq(s.timeLeft, 45, '+15 secondes');
eq(s.score, 1, '−1 point');
eq(s.pointsSinceCheckpoint, 1, 'les points dépensés ne peuvent plus être perdus');
eq(badMC(s).lost, 1, 'seuls les points restants sont perdus');

s = game();
goodRun(s, 2);                       // 4 pts, étape 3
var idBefore = q(s).id;
r = E.timeout(s);
eq(r.lost, 2, 'timer expiré = −2 points');
eq(s.score, 2, 'score diminué de 2');
eq(E.progress(s).step, 3, 'place conservée après un timeout');
ok(q(s).id !== idBefore, 'une nouvelle question est proposée');
ok(!E.progress(s).mcForced, 'un timeout n\'impose pas le QCM');
eq(s.timeLeft, 30, 'le timer repart à 30 s');

s = game();
eq(E.timeout(s).lost, 0, 'sans point, le timeout ne coûte rien');
eq(s.score, 0, 'le score ne descend jamais sous 0');

s = game();
good(s, 'free');                     // 2 pts
E.timeout(s);                        // −2 pts
eq(s.pointsSinceCheckpoint, 0, 'la pénalité de timeout réduit aussi les points en jeu');
eq(badMC(s).lost, 0, 'plus rien à perdre après la pénalité');

// ---------------------------------------------------------------- partie complète
section('Partie complète');
s = game();
var guard = 0;
while (!s.finished && guard++ < 500) goodRun(s, 1);
eq(s.finished, true, 'la partie se termine après la dernière classe');
eq(E.progress(s).level, undefined, 'plus aucune classe après la Terminale');
eq(s.score, bank.levels.length * bank.subjects.length * 2, 'score maximum théorique (2 pts × 5 matières × classes)');
eq(s.log.length, bank.levels.length * bank.subjects.length, 'une seule question par matière et par classe');

// ---------------------------------------------------------------- anti-répétition
section('Anti-répétition');
s = game({ config: { forceMCAfterFreeWrong: 0 } });   // garde-fou désactivé pour ce test
var seenIds = [];
for (var i = 0; i < 6; i++) { seenIds.push(q(s).id); E.answerFree(s, '???'); }
eq(new Set(seenIds).size, 6, '6 tirages successifs = 6 questions différentes (pool CP/Français = 6)');
var last = q(s).id;
E.answerFree(s, '???');
ok(q(s).id !== last, 'jamais deux fois de suite la même question, même pool épuisé');
var streak = {}, current;
for (i = 0; i < 40; i++) { current = q(s).id; streak[current] = (streak[current] || 0) + 1; E.answerFree(s, '???'); }
var maxRepeat = Math.max.apply(null, Object.keys(streak).map(function (k) { return streak[k]; }));
ok(maxRepeat <= 8, 'sur 40 tirages dans un pool de 6, la répartition reste équilibrée (max ' + maxRepeat + ')');

// ---------------------------------------------------------------- banque
section('Banque de questions');
var ids = {}, dupes = [], bad = [], counts = {};
bank.questions.forEach(function (x) {
  if (ids[x.id]) dupes.push(x.id); else ids[x.id] = 1;
  if (!/^[a-z0-9]+-[a-z]{2,4}-[0-9]{3}$/.test(x.id)) bad.push('id ' + x.id);
  if (bank.levels.indexOf(x.level) === -1) bad.push('niveau inconnu ' + x.id);
  if (bank.subjects.indexOf(x.subject) === -1) bad.push('matière inconnue ' + x.id);
  if (x.distractors.length !== 4) bad.push('distracteurs ≠ 4 : ' + x.id);
  if (!x.accepted.length) bad.push('accepted vide : ' + x.id);
  if (!E.checkFree(x, x.answer)) bad.push('la réponse canonique est refusée : ' + x.id);
  x.distractors.forEach(function (d) {
    if (E.normalize(d) === E.normalize(x.answer)) bad.push('distracteur = réponse : ' + x.id);
    if (E.checkFree(x, d)) bad.push('distracteur accepté comme bonne réponse : ' + x.id + ' (' + d + ')');
  });
  if (new Set(x.distractors.map(E.normalize)).size !== 4) bad.push('distracteurs en doublon : ' + x.id);
  var k = x.level + '|' + x.subject;
  counts[k] = (counts[k] || 0) + 1;
});
eq(dupes.length, 0, 'aucun id en doublon');
eq(bad.length, 0, 'aucune anomalie de contenu', bad.slice(0, 8).join(' | '));
eq(bank.questions.length, 360, '360 questions : 12 classes × 5 matières × 6');
var pools = Object.keys(counts);
eq(pools.length, bank.levels.length * bank.subjects.length, 'tous les couples classe/matière sont couverts');
ok(pools.every(function (k) { return counts[k] >= 6; }), 'au moins 6 questions par couple (classe, matière)',
  pools.filter(function (k) { return counts[k] < 6; }).join(', '));

console.log('\n' + pass + ' tests OK, ' + fail + ' échec(s)');
process.exit(fail ? 1 : 0);
