/* Tests du moteur + validation des banques de questions.
 * Lancer : node tests.js
 *
 * Règles v0.3
 *  - Mode BAC : 1 question par matière et par classe (5 au primaire, 6 dès la 6ème avec les
 *    Sciences), réponse libre 2 pts / QCM 1 pt, une réponse libre fausse impose le QCM,
 *    une erreur de QCM renvoie au début de la classe et coûte un cœur, 3 cœurs perdus font
 *    redescendre d'une classe, classe sans faute = +2 pts (primaire) ou +1 cœur (secondaire),
 *    timer expiré = −2 pts sans reculer.
 *  - Mode détente : 30 questions, 3 paliers de difficulté, aucune pénalité.
 */
var E = require('./engine.js');
var bank = require('./data/questions.json');
var relax = require('./data/detente.json');

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, name, extra) { ok(a === b, name, extra || ('attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a))); }
function section(t) { console.log('\n' + t); }

function game(opts) { return E.createGame(bank, Object.assign({ seed: 42 }, opts || {})); }
function relaxGame(opts) { return E.createRelax(relax, Object.assign({ seed: 11 }, opts || {})); }
function q(s) { return s.current; }
function good(s, mode) {
  return mode === 'mc' ? E.answerMC(s, s.current.answer) : E.answerFree(s, s.current.answer);
}
function badMC(s) { return E.answerMC(s, s.current.distractors[0]); }
/** Enchaîne n bonnes réponses en levant le QCM imposé si besoin. */
function goodRun(s, n, mode) {
  for (var i = 0; i < n; i++) {
    var r = good(s, mode);
    if (r && r.ok === false) good(s, 'mc');
  }
}
function findQ(id) { return bank.questions.find(function (x) { return x.id === id; }); }

// ---------------------------------------------------------------- normalisation
section('Normalisation et réponses libres');
eq(E.normalize('  Le  Chaton !  '), 'chaton', 'articles, casse et ponctuation retirés');
eq(E.normalize("l'école"), 'ecole', 'apostrophe et accents');
eq(E.normalize('le cœur'), 'coeur', 'ligature œ');
eq(E.normalize('3x²'), '3x2', 'exposant');
eq(E.toNumber('cinquante-six'), 56, 'nombre en lettres composé');
eq(E.toNumber('6,25'), 6.25, 'décimale à la virgule');
eq(E.toNumber('moins 8'), -8, '« moins 8 » vaut -8');

var qChaton = findQ('cp-fr-003');
ok(E.checkFree(qChaton, 'chaton'), 'réponse exacte acceptée');
ok(E.checkFree(qChaton, 'chatton'), 'faute de frappe tolérée');
ok(!E.checkFree(qChaton, 'chiot'), 'mauvaise réponse refusée');
ok(!E.checkFree(qChaton, ''), 'réponse vide refusée');
var qChev = findQ('ce1-fr-002');
ok(!E.checkFree(qChev, 'chevaus'), 'orthographe exigée sur une question de pluriel');
var qEau = findQ('3e-sci-004');
ok(E.checkFree(qEau, 'h2o'), 'formule chimique acceptée en minuscules');
ok(!E.checkFree(qEau, 'HO2'), 'formule voisine refusée');

// ---------------------------------------------------------------- structure BAC
section('Mode BAC : matières par classe, Sciences dès la 6ème');
var s = game();
eq(E.progress(s).mode, 'bac', 'mode bac');
eq(E.progress(s).steps, 5, 'le primaire compte 5 matières');
ok(E.progress(s).subjects.indexOf('Sciences') === -1, 'pas de Sciences au CP');
s.levelIndex = 5; s.subjectIndex = 0; E.nextQuestion(s);
eq(E.progress(s).level, '6ème', 'on peut se placer en 6ème');
eq(E.progress(s).steps, 6, 'le secondaire compte 6 matières');
ok(E.progress(s).subjects.indexOf('Sciences') !== -1, 'les Sciences apparaissent en 6ème');

s = game();
eq(E.progress(s).lives, 3, 'trois cœurs au départ');
goodRun(s, 5);
eq(E.progress(s).level, 'CE1', '5 bonnes réponses = classe suivante au primaire');
eq(s.score, 12, '5 × 2 points + 2 de bonus de classe parfaite');

// ---------------------------------------------------------------- bonus de classe
section('Bonus de classe sans faute');
s = game();
var r = null;
for (var i = 0; i < 5; i++) r = good(s, 'free');
eq(r.event, 'levelUp', 'la 5e bonne réponse valide la classe');
ok(!!r.bonus && r.bonus.kind === 'points', 'bonus en points au primaire');
eq(r.bonus.amount, 2, '+2 points');

s = game();
E.answerFree(s, 'faux');            // une faute annule le bonus
var last = null;
for (i = 0; i < 5; i++) { var y = good(s, 'free'); last = (y.ok === false) ? good(s, 'mc') : y; }
eq(last.event, 'levelUp', 'la classe est quand même validée');
eq(!!last.bonus, false, 'aucun bonus si la classe a connu une faute');
eq(s.score, 9, 'un QCM imposé (1 pt) puis 4 réponses libres (8 pts)');

s = game({ levelIndex: 5 });        // 6ème : le bonus est une vie
r = null;
for (i = 0; i < 6; i++) { var x = good(s, 'free'); if (x.ok !== false) r = x; else r = good(s, 'mc'); }
eq(r.event, 'levelUp', '6 bonnes réponses valident la 6ème');
ok(!!r.bonus && r.bonus.kind === 'life', 'bonus en vie au secondaire');
eq(s.lives, 4, 'un cœur de plus');

// ---------------------------------------------------------------- cœurs
section('Cœurs : erreur de QCM, puis rétrogradation');
s = game();
goodRun(s, 5);                      // CE1, 12 points sécurisés
goodRun(s, 2);
var before = s.score;
r = badMC(s);
eq(r.lives, 2, 'un cœur perdu sur une erreur de QCM');
eq(E.progress(s).step, 1, 'retour au début de la classe');
eq(s.score, before - r.lost, 'les points de la classe sont effacés');
eq(E.progress(s).level, 'CE1', 'la classe ne change pas encore');
r = badMC(s);
eq(r.lives, 1, 'deuxième cœur perdu');
r = badMC(s);
eq(r.demoted, true, 'au troisième, on redescend d\'une classe');
eq(E.progress(s).level, 'CP', 'retour au CP');
eq(E.progress(s).step, 1, 'à la première matière');
eq(s.lives, 3, 'trois cœurs neufs');
eq(s.score, 0, 'la classe où l\'on redescend redevient à refaire : ses points sont rendus');

s = game();                          // au CP, on ne peut pas descendre plus bas
badMC(s); badMC(s); r = badMC(s);
eq(E.progress(s).level, 'CP', 'on reste au CP');
eq(s.lives, 3, 'les cœurs sont quand même rendus');

// ---------------------------------------------------------------- réponse libre fausse
section('Réponse libre fausse : QCM imposé, aucune perte');
s = game();
before = { score: s.score, step: E.progress(s).step, id: q(s).id };
r = E.answerFree(s, 'nimportequoi');
eq(r.correct, false, 'réponse fausse détectée');
eq(s.score, before.score, 'aucun point perdu');
eq(E.progress(s).step, before.step, 'place conservée');
eq(s.lives, 3, 'aucun cœur perdu');
ok(q(s).id !== before.id, 'une autre question est proposée');
ok(E.progress(s).mcForced, 'QCM imposé dès la première erreur libre');
eq(E.answerFree(s, 'encore faux').reason, 'mcForced', 'la réponse libre est refusée');
eq(good(s, 'mc').points, 1, 'le QCM rapporte 1 point');
ok(!E.progress(s).mcForced, 'garde-fou levé après une bonne réponse');

// ---------------------------------------------------------------- timer
section('Timer, rachat et expiration (mode BAC)');
s = game();
eq(s.timeLeft, 30, 'timer de 30 s');
eq(E.buyTime(s).ok, false, 'rachat impossible sans point');
good(s, 'free');
eq(E.buyTime(s).ok, true, 'rachat possible');
eq(s.timeLeft, 45, '+15 secondes');
eq(s.score, 1, '−1 point');
s = game();
goodRun(s, 2);
r = E.timeout(s);
eq(r.lost, 2, 'timer expiré = −2 points');
eq(E.progress(s).step, 3, 'place conservée');
eq(s.lives, 3, 'aucun cœur perdu sur un timeout');
ok(!E.progress(s).perfectSoFar, 'un timeout annule le bonus de classe');

// ---------------------------------------------------------------- partie complète
section('Partie parfaite jusqu\'au BAC');
s = game();
var guard = 0;
while (!s.finished && guard++ < 500) goodRun(s, 1, 'free');
eq(s.finished, true, 'la partie se termine');
eq(s.won, true, 'le BAC est obtenu');
eq(s.score, E.maxScore(bank), 'score maximum théorique atteint (' + E.maxScore(bank) + ')');
eq(s.log.length, 5 * 5 + 7 * 6, '25 questions au primaire + 42 au secondaire');

// ---------------------------------------------------------------- mode détente
section('Mode détente : 30 questions, aucune pénalité');
var d = relaxGame();
eq(E.progress(d).mode, 'detente', 'mode détente');
eq(d.queue.length, 30, '30 questions');
var tiers = d.queue.map(function (x) { return x.difficulty; });
eq(tiers.slice(0, 10).every(function (t) { return t === 1; }), true, 'les 10 premières sont faciles');
eq(tiers.slice(10, 20).every(function (t) { return t === 2; }), true, 'les 10 suivantes sont moyennes');
eq(tiers.slice(20).every(function (t) { return t === 3; }), true, 'les 10 dernières sont difficiles');
eq(new Set(d.queue.map(function (x) { return x.id; })).size, 30, 'aucune question en double');
ok(new Set(d.queue.map(function (x) { return x.theme; })).size > 1, 'plusieurs thèmes mélangés');

eq(good(d, 'free').points, 2, 'réponse libre correcte = 2 points');
eq(E.progress(d).question, 2, 'on passe à la question 2');
r = E.answerFree(d, 'totalement faux');
eq(r.correct, false, 'réponse fausse');
eq(d.score, 2, 'aucun point perdu');
eq(E.progress(d).question, 3, 'on passe simplement à la suivante');
ok(!E.progress(d).mcForced, 'pas de QCM imposé en détente');
eq(good(d, 'mc').points, 1, 'le QCM rapporte 1 point');
r = E.timeout(d);
eq(r.lost, 0, 'un timeout ne coûte rien');
eq(E.progress(d).question, 5, 'et fait avancer');
eq(E.buyTime(d).ok, true, 'le rachat de temps existe aussi en détente');
eq(d.timeLeft, 45, '+15 secondes');

d = relaxGame();
guard = 0;
while (!d.finished && guard++ < 100) good(d, 'free');
eq(d.finished, true, 'la partie se termine après 30 questions');
eq(d.score, 60, 'score maximum : 30 × 2 points');
eq(d.correctCount, 30, '30 bonnes réponses comptées');

// ---------------------------------------------------------------- banques
section('Banques de questions');
[{ b: bank, n: 'BAC' }, { b: relax, n: 'détente' }].forEach(function (set) {
  var bad = [], ids = {};
  set.b.questions.forEach(function (x) {
    if (ids[x.id]) bad.push('id en doublon ' + x.id); else ids[x.id] = 1;
    if (x.distractors.length !== 4) bad.push('distracteurs ≠ 4 : ' + x.id);
    if (new Set(x.distractors.map(E.normalize)).size !== 4) bad.push('distracteurs en doublon : ' + x.id);
    if (!E.checkFree(x, x.answer)) bad.push('réponse canonique refusée : ' + x.id);
    x.accepted.forEach(function (a) { if (!E.checkFree(x, a)) bad.push('variante refusée : ' + x.id); });
    x.distractors.forEach(function (dd) { if (E.checkFree(x, dd)) bad.push('distracteur accepté : ' + x.id); });
  });
  eq(bad.length, 0, 'banque ' + set.n + ' sans anomalie', bad.slice(0, 6).join(' | '));
});

var counts = {};
bank.questions.forEach(function (x) { counts[x.level + '|' + x.subject] = (counts[x.level + '|' + x.subject] || 0) + 1; });
var pools = Object.keys(counts);
eq(pools.length, 5 * 5 + 7 * 6, 'tous les pools attendus existent (25 primaire + 42 secondaire)');
ok(pools.every(function (k) { return counts[k] >= 6; }), 'au moins 6 questions par pool',
  pools.filter(function (k) { return counts[k] < 6; }).join(', '));
ok(relax.questions.length >= 30, 'au moins 30 questions en détente');
[1, 2, 3].forEach(function (t) {
  var n = relax.questions.filter(function (x) { return x.difficulty === t; }).length;
  ok(n >= 10, 'au moins 10 questions de difficulté ' + t + ' en détente (' + n + ')');
});

console.log('\n' + pass + ' tests OK, ' + fail + ' échec(s)');
process.exit(fail ? 1 : 0);
