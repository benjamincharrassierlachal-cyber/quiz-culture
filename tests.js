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

var pass = 0, fail = 0, differed = false;
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

// ---------------------------------------------------------------- sauvegarde et reprise
section('Sauvegarde d\'une partie et reprise');
s = game();
goodRun(s, 7);
var snap = E.serialize(s);
eq(snap.mode, 'bac', 'la photographie retient le mode');
eq(snap.level, E.progress(s).level, 'et la classe en cours');
var back = E.restore(snap, { bac: bank, detente: relax }, {});
eq(back.score, s.score, 'score identique après reprise');
eq(E.progress(back).level, E.progress(s).level, 'même classe');
eq(E.progress(back).subject, E.progress(s).subject, 'même matière');
eq(back.current.id, s.current.id, 'même question posée');
eq(back.lives, s.lives, 'mêmes cœurs');
eq(back.seen.length, s.seen.length, 'mémoire des questions vues conservée');
eq(back.timeLeft, Math.round(s.timeLeft), 'le chrono reprend là où il s\'était arrêté');
s.timeLeft = 8.4;
var mid = E.restore(E.serialize(s), { bac: bank, detente: relax }, {});
eq(mid.timeLeft, 8, 'mettre la partie de côté ne rend pas de temps');
eq(mid.budget, 8, 'le budget suit, le temps de jeu reste juste');
s.timeLeft = 1;
var tight = E.restore(E.serialize(s), { bac: bank, detente: relax }, {});
eq(tight.timeLeft, 5, 'plancher de 5 secondes pour relire la question');
goodRun(back, 3);
ok(back.score > s.score, 'la partie reprise continue de marquer des points');

d = relaxGame();
for (i = 0; i < 12; i++) good(d, 'free');
var dsnap = E.serialize(d);
var dback = E.restore(dsnap, { bac: bank, detente: relax }, {});
eq(E.progress(dback).question, E.progress(d).question, 'détente : reprise à la bonne question');
eq(dback.score, d.score, 'détente : score conservé');
eq(dback.queue.length, 30, 'détente : la série de 30 est restaurée');
eq(dback.current.id, d.current.id, 'détente : même question posée');

eq(E.restore(null, { bac: bank, detente: relax }, {}), null, 'une sauvegarde vide ne casse rien');

section('Anti-répétition entre deux parties');
var first = relaxGame({ seed: 21 });
var firstIds = first.queue.map(function (x) { return x.id; });
var second = E.createRelax(relax, { seed: 22, seen: firstIds });
var repeats = second.queue.filter(function (x) { return firstIds.indexOf(x.id) !== -1; }).length;
eq(repeats, 0, 'aucune question de la partie précédente ne revient en détente');
var g1 = game({ seed: 31 });
goodRun(g1, 5);
ok(g1.seen.length >= 5, 'les questions jouées sont mémorisées');
var g2 = E.createGame(bank, { seed: 32, seen: g1.seen });
ok(g1.seen.indexOf(g2.current.id) === -1, 'la partie suivante commence sur une question inédite');

// ---------------------------------------------------------------- jokers
section('Jokers : 40/60, changer, passer (dès la 6ème)');
s = game();
eq(E.canUseJoker(s, 'fifty'), false, 'aucun joker au CP');
eq(E.useJoker(s, 'fifty').reason, 'tooEarly', 'le moteur explique que c\'est trop tôt');
/** Avance jusqu'à la classe demandée en répondant juste. */
function upTo(s, index) {
  for (var i = 0; i < 300 && s.levelIndex < index && !s.finished; i++) goodRun(s, 1);
  return s;
}
upTo(s, 5);
eq(E.progress(s).level, '6ème', 'la 6ème est atteinte');
ok(E.progress(s).jokersOpen, 'les jokers s\'ouvrent en 6ème');
eq(E.progress(s).jokerCost, 6, 'un joker coûte 6 points');

var before = s.score;
var r = E.useJoker(s, 'fifty');
eq(r.ok, true, '40/60 accepté');
eq(s.score, before - 6, '40/60 débité de 6 points');
eq(r.hidden.length, 3, '40/60 barre trois propositions');
ok(r.hidden.indexOf(s.current.answer) === -1, '40/60 ne barre jamais la bonne réponse');
ok(r.hidden.every(function (h) { return s.current.distractors.indexOf(h) !== -1; }),
  '40/60 ne barre que des mauvaises réponses');
eq(E.canUseJoker(s, 'fifty'), false, '40/60 ne se rejoue pas');
eq(E.progress(s).perfectSoFar, false, 'un joker fait perdre le bonus de classe sans faute');
eq(E.useJoker(s, 'fifty').reason, 'used', 'le moteur signale un joker déjà utilisé');
eq(E.progress(s).hiddenWrong.length, 3, 'les propositions barrées restent visibles pour l\'interface');
goodRun(s, 1);
eq(s.hiddenWrong.length, 0, 'les propositions barrées disparaissent à la question suivante');

var prevId = s.current.id;
before = s.score;
r = E.useJoker(s, 'swap');
eq(r.ok, true, 'changer de question accepté');
eq(s.score, before - 6, 'changer coûte 6 points');
ok(s.current.id !== prevId, 'la question a bien changé');
eq(s.current.subject, E.progress(s).subject, 'la matière reste la même');
ok(s.seen.indexOf(prevId) !== -1, 'la question abandonnée est marquée comme vue');

var subj = E.progress(s).subject, corr = E.progress(s).correct;
before = s.score;
r = E.useJoker(s, 'pass');
eq(r.ok, true, 'passer accepté');
eq(s.score, before - 6, 'passer coûte 6 points');
ok(E.progress(s).subject !== subj || s.levelIndex > 5, 'passer fait passer à la matière suivante');
eq(E.progress(s).correct, corr, 'la question passée ne compte pas comme une bonne réponse');
eq(s.classErrors > 0, true, 'la classe n\'est plus « sans faute » après un joker passe');
eq(E.canUseJoker(s, 'pass'), false, 'chaque joker ne sert qu\'une fois');

var poor = game();
upTo(poor, 5);
poor.score = 3;
eq(E.canUseJoker(poor, 'swap'), false, 'pas de joker sous 6 points');
eq(E.useJoker(poor, 'swap').reason, 'noPoints', 'le moteur signale le manque de points');

var relaxJ = relaxGame();
eq(E.canUseJoker(relaxJ, 'fifty'), false, 'aucun joker en mode détente');

// ---------------------------------------------------------------- temps de jeu
section('Temps de jeu (départage du classement)');
s = game();
eq(E.progress(s).spent, 0, 'aucun temps compté au départ');
s.timeLeft = 20;                       // 10 secondes se sont écoulées
good(s);
eq(E.progress(s).spent, 10, 'le temps de réflexion est compté');
s.timeLeft = 25;
good(s);
eq(E.progress(s).spent, 15, 'le compteur s\'additionne question après question');
s.timeLeft = 10;
E.buyTime(s);                          // +15 s achetés : le budget suit
eq(s.timeLeft, 25, 'le rachat ajoute 15 secondes');
good(s);
eq(E.progress(s).spent, 35, 'le temps racheté compte aussi');
s.timeLeft = 0;
E.timeout(s);
eq(E.progress(s).spent, 65, 'un temps écoulé compte le temps entier');

// une pause coûte du temps de jeu : le chrono s'arrête, pas le compteur du classement
var beforePause = E.progress(s).spent;
var pz = E.penalizePause(s);
eq(pz.cost, 20, 'une pause coûte 20 secondes');
eq(E.progress(s).spent, beforePause + 20, 'les secondes de pause sont ajoutées au temps de jeu');
E.penalizePause(s);
eq(E.progress(s).pauses, 2, 'les pauses sont comptées');
eq(E.progress(s).spent, beforePause + 40, 'deux pauses coûtent 40 secondes');

var tsnap = E.serialize(s);
var tback = E.restore(tsnap, { bac: bank, detente: relax }, {});
eq(E.progress(tback).spent, E.progress(s).spent, 'le temps de jeu survit à une reprise');
eq(E.progress(tback).pauses, 2, 'le nombre de pauses survit à une reprise');
eq(JSON.stringify(tback.jokers), JSON.stringify(s.jokers), 'les jokers restants survivent à une reprise');

var sc = require('./scores.js');
var rows = [{ score: 20, seconds: 300 }, { score: 20, seconds: 120 }, { score: 25, seconds: 900 }, { score: 20 }];
rows.sort(sc.byScoreThenTime);
eq(rows[0].score, 25, 'le meilleur score reste premier');
eq(rows[1].seconds, 120, 'à score égal, le plus rapide passe devant');
eq(rows[3].seconds, undefined, 'un temps inconnu part en dernier');

// ---------------------------------------------------------------- numéro de joueur
section('Numéro de joueur : un par pseudo, conservé');
(function () {
  var store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  global.window = global.window || { LEADERBOARD: {} };
  global.self = global.self || {};
  delete require.cache[require.resolve('./scores.js')];
  var SC = require('./scores.js');

  SC.setPseudo('Benji');
  var benji = SC.getTag();
  ok(/^\d{5}$/.test(benji), 'le numéro fait 5 chiffres (' + benji + ')');
  SC.setPseudo('Dédé');
  var dede = SC.getTag();
  ok(dede !== benji, 'un second joueur sur le même appareil reçoit un autre numéro');
  SC.setPseudo('Benji');
  eq(SC.getTag(), benji, 'le premier joueur retrouve son numéro en revenant');
  eq(SC.getTag('Dédé'), dede, 'et on peut lire le numéro d\'un autre pseudo');
  eq(SC.getTag('BENJI'), benji, 'la casse du pseudo ne crée pas un second numéro');
  eq(SC.displayName(), 'Benji #' + benji, 'nom affiché : pseudo + numéro');

  var accs = SC.accounts();
  eq(accs.length, 2, 'les deux comptes de l\'appareil sont mémorisés');
  eq(accs[0].pseudo, 'Benji', 'le plus récemment utilisé arrive en tête');
  eq(accs.filter(function (a) { return a.pseudo === 'Dédé'; })[0].tag, dede,
    'chaque compte garde son numéro dans la liste');
})();

// ---------------------------------------------------------------- identité en ligne
section('Numéro officialisé par le serveur');
(function () {
  var store = {}, calls = [];
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  global.window = { LEADERBOARD: { url: 'https://p.supabase.co', anonKey: 'eyJfake' } };
  global.navigator = { onLine: true };
  var reply = { ok: true, status: 200, body: '"482913"' };
  global.fetch = function (url, opt) {
    calls.push({ url: url, body: JSON.parse(opt.body) });
    return Promise.resolve({
      ok: reply.ok, status: reply.status,
      text: function () { return Promise.resolve(reply.body); }
    });
  };
  delete require.cache[require.resolve('./scores.js')];
  var SC = require('./scores.js');

  eq(SC.maskTag('482913'), '48***3', 'numéro masqué : deux chiffres, puis le dernier');
  eq(SC.maskTag('10256'), '10**6', 'un ancien numéro à 5 chiffres est masqué aussi');

  SC.setPseudo('Benji');
  var local = SC.getTag();
  SC.registerTag('Benji').then(function (tag) {
    eq(tag, '482913', 'le serveur renvoie le numéro officiel');
    eq(SC.getTag(), '482913', 'et il remplace le numéro local');
    eq(calls[0].body.p_wanted, local, 'le numéro déjà utilisé est proposé au serveur');
    ok(/rpc\/claim_pseudo$/.test(calls[0].url), 'appel de la fonction claim_pseudo');

    // récupération sur un autre appareil
    reply = { ok: true, status: 200, body: 'true' };
    return SC.recoverAccount('Dédé', '123456');
  }).then(function (res) {
    eq(res.tag, '123456', 'compte retrouvé : le numéro saisi est adopté');
    eq(SC.getPseudo(), 'Dédé', 'et le pseudo suit');
    reply = { ok: true, status: 200, body: 'false' };
    return SC.recoverAccount('Dédé', '999999').then(function () { return 'accepté'; },
                                                    function (e) { return e.message; });
  }).then(function (msg) {
    ok(/ne vont pas ensemble/.test(msg), 'un mauvais couple pseudo/numéro est refusé');
    reply = { ok: false, status: 400, body: '{"message":"trop d essais"}' };
    return SC.recoverAccount('Dédé', '123456').then(function () { return 'accepté'; },
                                                    function (e) { return e.message; });
  }).then(function (msg) {
    ok(/trop d/.test(msg), 'le bridage du serveur remonte jusqu\'au joueur');
    console.log('\n' + pass + ' tests OK, ' + fail + ' échec(s)');
    process.exit(fail ? 1 : 0);
  });
  differed = true;
})();

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
ok(pools.every(function (k) { return counts[k] >= 20; }), 'au moins 20 questions par pool',
  pools.filter(function (k) { return counts[k] < 20; }).join(', '));
var small = pools.filter(function (k) { return counts[k] < 24; });
ok(small.length === 0, 'au moins 24 questions dans chacun des 67 pools', small.join(', '));
ok(bank.questions.length >= 1600, 'au moins 1 600 questions en mode BAC (' + bank.questions.length + ')');
ok(relax.questions.length >= 1000, 'au moins 1 000 questions en détente (' + relax.questions.length + ')');
eq(relax.themes.length, 8, 'huit thèmes en détente');
[1, 2, 3].forEach(function (t) {
  var n = relax.questions.filter(function (x) { return x.difficulty === t; }).length;
  ok(n >= 300, 'au moins 300 questions de difficulté ' + t + ' en détente (' + n + ')');
});
relax.themes.forEach(function (th) {
  var n = relax.questions.filter(function (x) { return x.theme === th; }).length;
  ok(n >= 125, 'thème « ' + th + ' » complet (' + n + ' questions)');
});

if (!differed) {
  console.log('\n' + pass + ' tests OK, ' + fail + ' échec(s)');
  process.exit(fail ? 1 : 0);
}
