/* Test de bout en bout de l'interface, sans navigateur.
 *
 * Un faux DOM minimal permet de dérouler une partie complète (clics compris) et de repérer
 * toute exception pendant un rendu — c'est exactement ce qui provoquait un écran figé, puisque
 * le chrono est arrêté avant le rendu et que l'affichage n'est alors jamais remplacé.
 *
 * Lancer : node tools/uitest.js
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

// le dernier bloc <script> du template est le code de l'interface
var scripts = tpl.match(/<script>([\s\S]*?)<\/script>/g).map(function (s) {
  return s.replace(/^<script>/, '').replace(/<\/script>$/, '');
});
var uiCode = scripts[scripts.length - 1];

// ------------------------------------------------------------------ faux DOM
var els = {}, lastHtml = { app: '', fx: '' };
function el(id) {
  if (els[id]) return els[id];
  var e = {
    id: id, value: '', textContent: '', disabled: false, className: '',
    onclick: null, onkeydown: null, oninput: null, style: {},
    focus: function () {}, setAttribute: function () {}, getAttribute: function (k) { return e._attrs[k]; },
    _attrs: {}, children: [],
    // les groupes SVG manipulés par l'animation ont des enfants
    firstChild: { setAttribute: function () {}, innerHTML: '' },
    lastChild: { setAttribute: function () {}, innerHTML: '' },
    get innerHTML() { return e._html || ''; },
    set innerHTML(v) {
      e._html = v;
      if (id === 'app' || id === 'fx') {
        lastHtml[id] = v;
        // le DOM est remplacé : plus aucun gestionnaire n'est branché
        Object.keys(els).forEach(function (k) {
          if (k === 'app' || k === 'fx') return;
          els[k].onclick = els[k].onkeydown = els[k].oninput = null;
          els[k].present = false;
        });
        (v.match(/id="([a-z-]+)"/g) || []).forEach(function (m) {
          var k = m.slice(4, -1);
          el(k).present = true;
        });
      }
    }
  };
  els[id] = e;
  return e;
}

var optionEls = [], jokerEls = [];
var document = {
  hidden: false, addEventListener: function () {},
  getElementById: function (id) { var e = el(id); return e.present === false ? null : e; },
  querySelector: function () { return null; },
  querySelectorAll: function (sel) {
    // on ne renvoie que les boutons réellement présents dans le dernier rendu : sinon le test
    // pourrait cliquer une réponse alors que l'écran affiche la carte
    var attr = sel === '[data-joker]' ? 'data-joker' : (sel === '[data-opt]' ? 'data-opt' : null);
    if (!attr) return [];
    var found = (lastHtml.app.match(new RegExp(attr + '="([a-z0-9]+)"', 'g')) || []).map(function (m) {
      return m.slice(attr.length + 2, -1);
    });
    var list = found.map(function (v) {
      var e = { _attrs: {}, getAttribute: function (k) { return this._attrs[k]; }, onclick: null };
      e._attrs[attr] = v;
      return e;
    });
    if (attr === 'data-joker') jokerEls = list; else optionEls = list;
    return list;
  }
};
els.app = null; delete els.app;
el('app').present = true; el('fx').present = true;

var store = {};
var localStorage = {
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
store['quizculture.mute'] = '1';        // pas de son dans le test

var clock = 0;
var FakeDate = function () { return new Date(); };
FakeDate.now = function () { clock += 60; return clock; };

var timers = {}, pending = [], nextId = 1;
function setTimeoutStub(fn) { fn(); return 0; }              // exécution immédiate
/** On enregistre l'intervalle sans l'exécuter : le code appelant doit d'abord recevoir son id
 *  (c'est ce que fait un vrai navigateur, et clearInterval en dépend). */
function setIntervalStub(fn) {
  var id = nextId++;
  timers[id] = true;
  pending.push({ id: id, fn: fn });
  return id;
}
function clearIntervalStub(id) { delete timers[id]; }
/** Fait tourner les animations en attente, comme le ferait la boucle du navigateur. */
function drain() {
  var guard = 0;
  while (pending.length && guard++ < 50) {
    var t = pending.shift();
    for (var i = 0; i < 400 && timers[t.id]; i++) t.fn();
  }
}

/* Moteur réel, mais on choisit à l'avance si les réponses doivent être justes ou fausses :
 * l'interface ne connaît pas les bonnes réponses, c'est donc ici qu'on décide du scénario. */
var realEngine = require(path.join(root, 'engine.js'));
var style = 'right', tick = 0;
var engine = Object.create(realEngine);
function wantRight() {
  if (style === 'right') return true;
  if (style === 'wrong') return false;
  return (tick++ % 3) !== 0;                       // « mixte » : une réponse sur trois est fausse
}
engine.answerFree = function (state, input) {
  return realEngine.answerFree(state, wantRight() ? state.current.answer : 'reponse totalement fausse');
};
engine.answerMC = function (state, choice) {
  return realEngine.answerMC(state, wantRight() ? state.current.answer : state.current.distractors[0]);
};

global.localStorage = localStorage;   // scores.js s'appuie sur le localStorage global

var win = {
  onerror: null,
  addEventListener: function () {},
  QuizEngine: engine,
  Scores: require(path.join(root, 'scores.js')),
  LEADERBOARD: { url: '', anonKey: '' },
  AudioContext: null,
  SpeechRecognition: null,
  navigator: { onLine: true }
};

var BANK = require(path.join(root, 'data', 'questions.json'));
var RELAX = require(path.join(root, 'data', 'detente.json'));
win.Scores.configured();     // s'assure que le module se charge

function run(label, mode, maxSteps, how, viaQcm) {
  style = how || 'right'; tick = 0;
  store = {}; store['quizculture.mute'] = '1';
  Object.keys(els).forEach(function (k) { delete els[k]; });
  el('app').present = true; el('fx').present = true;
  lastHtml.app = ''; lastHtml.fx = '';

  var ui = new Function('document', 'window', 'localStorage', 'Date', 'setTimeout', 'setInterval',
    'clearInterval', 'navigator', 'BANK', 'RELAX', 'LEADERBOARD', 'BUILD', 'alert', 'confirm', 'fetch', uiCode);
  ui(document, win, localStorage, FakeDate, setTimeoutStub, setIntervalStub, clearIntervalStub,
    win.navigator, BANK, RELAX, win.LEADERBOARD, { version: 'test', date: '2026-01-01 00:00' },
    function () {}, function () { return true; }, undefined);

  function click(id) {
    var e = document.getElementById(id);
    if (e && e.onclick) { e.onclick(); drain(); return true; }
    return false;
  }
  function submitAnswer() {
    var f = document.getElementById('answer-form');
    if (!f || !f.onsubmit) return false;
    f.onsubmit({ preventDefault: function () {} });
    drain();
    return true;
  }

  click('start');                                   // écran-titre → vortex → modes
  click(mode === 'bac' ? 'm-bac' : 'm-relax');      // le pop-up pseudo s'ouvre
  click('px');                                      // on le ferme par la croix

  var steps = 0, seen = {};
  while (steps++ < maxSteps) {
    var html = lastHtml.app;
    if (/tu as le BAC|Quizz terminé|Partie terminée/.test(html)) {
      return { ok: true, steps: steps, end: /tu as le BAC/.test(html) ? 'diplôme'
        : (/Quizz terminé/.test(html) ? 'score détente' : 'fin de banque') };
    }
    if (viaQcm && click('openmc')) continue;        // scénario « tout en choix multiple »
    var free = document.getElementById('free');
    if (free) free.value = 'ma reponse';            // le champ doit être rempli pour valider
    if (!viaQcm && submitAnswer()) continue;        // valider (comme la touche OK du clavier)
    if (optionEls.length && optionEls[0].onclick) { optionEls[0].onclick(); drain(); continue; }
    if (click('next')) continue;                    // carte / palier
    if (click('p-resume')) continue;                // écran de pause : on repart
    if (click('again')) continue;                   // écran de fin : rejouer
    return { ok: false, steps: steps, reason: 'aucun bouton actif', html: html.slice(0, 400) };
  }
  return { ok: false, steps: steps, reason: 'trop d\'étapes', unfinished: true };
}

// ------------------------------------------------------------------ scénarios pilotés à la main
/** Démarre une interface neuve et renvoie de quoi la piloter. */
function boot(keepStore) {
  style = 'right'; tick = 0;
  if (!keepStore) { store = {}; store['quizculture.mute'] = '1'; }
  Object.keys(els).forEach(function (k) { delete els[k]; });
  el('app').present = true; el('fx').present = true;
  lastHtml.app = ''; lastHtml.fx = '';

  var ui = new Function('document', 'window', 'localStorage', 'Date', 'setTimeout', 'setInterval',
    'clearInterval', 'navigator', 'BANK', 'RELAX', 'LEADERBOARD', 'BUILD', 'alert', 'confirm', 'fetch', uiCode);
  ui(document, win, localStorage, FakeDate, setTimeoutStub, setIntervalStub, clearIntervalStub,
    win.navigator, BANK, RELAX, win.LEADERBOARD, { version: 'test', date: '2026-01-01 00:00' },
    function () {}, function () { return true; }, undefined);

  var api = {
    click: function (id) {
      var e = document.getElementById(id);
      if (e && e.onclick) { e.onclick(); drain(); return true; }
      return false;
    },
    answer: function () {
      var free = document.getElementById('free');
      if (free) free.value = 'ma reponse';           // le champ doit être rempli pour valider
      var f = document.getElementById('answer-form');
      if (!f || !f.onsubmit) return false;
      f.onsubmit({ preventDefault: function () {} });
      drain();
      return true;
    },
    option: function () {
      var o = optionEls.filter(function (x) { return !!x.onclick; })[0];
      if (!o) return false;
      o.onclick(); drain(); return true;
    },
    joker: function (kind) {
      var j = jokerEls.filter(function (x) { return x.getAttribute('data-joker') === kind && x.onclick; })[0];
      if (!j) return false;
      j.onclick(); drain(); return true;
    },
    /** Enchaîne les écrans jusqu'à retrouver une question jouable. */
    toQuestion: function (max) {
      var n = 0;
      while (n++ < (max || 40)) {
        if (document.getElementById('answer-form')) return true;
        if (!api.click('next')) return false;
      }
      return false;
    }
  };
  return api;
}

// ------------------------------------------------------------------ page des règles
function runRules() {
  var ui = boot();
  if (!ui.click('info')) return { ok: false, reason: 'pas de bouton « i » sur l\'écran-titre' };
  if (!/Les règles/.test(lastHtml.app)) return { ok: false, reason: 'la page des règles ne s\'affiche pas' };
  ['Le but', 'Répondre', 'Le temps', 'Se tromper', 'Les vies', 'La classe parfaite', 'Les jokers'].forEach(function (t) {
    if (lastHtml.app.indexOf(t) === -1) throw new Error('section manquante : ' + t);
  });
  if (!ui.click('back')) return { ok: false, reason: 'pas de retour depuis les règles' };
  if (!/Commencer/.test(lastHtml.app)) return { ok: false, reason: 'le retour ne ramène pas à l\'écran-titre' };

  // depuis une question : on doit revenir à la question, chrono compris
  ui.click('start'); ui.click('m-bac'); ui.click('px');
  if (!ui.toQuestion()) return { ok: false, reason: 'aucune question' };
  if (!ui.click('info')) return { ok: false, reason: 'pas de bouton « i » pendant une question' };
  if (!/Les règles/.test(lastHtml.app)) return { ok: false, reason: 'règles inaccessibles en jeu' };
  if (!ui.click('back')) return { ok: false, reason: 'pas de retour depuis les règles en jeu' };
  if (!document.getElementById('answer-form')) return { ok: false, reason: 'le retour ne ramène pas à la question' };
  if (/id="mute"|🔊|🔇/.test(lastHtml.app)) return { ok: false, reason: 'le bouton son est toujours là' };
  return { ok: true, end: 'ouverture depuis l\'accueil et depuis une question, retour correct' };
}

// ------------------------------------------------------------------ jokers (à partir de la 6ème)
function runJokers() {
  var ui = boot();
  ui.click('start'); ui.click('m-bac'); ui.click('px');

  // on avance jusqu'à la 6ème : la barre de jokers n'apparaît qu'à partir de là
  var steps = 0, announced = false;
  while (steps++ < 400 && !/data-joker/.test(lastHtml.app)) {
    if (/3 jokers/.test(lastHtml.app)) announced = true;
    if (/tu as le BAC/.test(lastHtml.app)) return { ok: false, reason: 'jamais vu de joker' };
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    return { ok: false, reason: 'blocage avant la 6ème' };
  }
  if (!announced) return { ok: false, reason: 'l\'écran d\'annonce des jokers ne s\'affiche pas' };
  if (!/40\/60/.test(lastHtml.app) || !/Changer/.test(lastHtml.app) || !/Passer/.test(lastHtml.app)) {
    return { ok: false, reason: 'barre de jokers incomplète' };
  }

  // 40/60 : trois mauvaises réponses barrées, la bonne épargnée
  if (!ui.joker('fifty')) return { ok: false, reason: 'joker 40/60 non cliquable' };
  if ((lastHtml.app.match(/opt out/g) || []).length !== 3) {
    return { ok: false, reason: 'le 40/60 ne barre pas 3 réponses' };
  }
  if (!ui.option()) return { ok: false, reason: 'plus aucune réponse jouable après le 40/60' };
  if (!ui.toQuestion()) return { ok: false, reason: 'blocage après le 40/60' };
  if (!/utilisé/.test(lastHtml.app)) return { ok: false, reason: 'le 40/60 reste réutilisable' };

  // changer de question, puis passer la suivante
  if (!ui.joker('swap')) return { ok: false, reason: 'joker « changer » non cliquable' };
  if (!ui.toQuestion()) return { ok: false, reason: 'blocage après le changement de question' };
  if (!ui.joker('pass')) return { ok: false, reason: 'joker « passer » non cliquable' };
  if (!ui.toQuestion()) return { ok: false, reason: 'blocage après la question passée' };
  if ((lastHtml.app.match(/utilisé/g) || []).length !== 3) {
    return { ok: false, reason: 'les jokers ne sont pas tous consommés' };
  }

  // la partie doit rester jouable jusqu'au diplôme
  var loops = 0;
  while (loops++ < 600) {
    if (/tu as le BAC|Partie terminée/.test(lastHtml.app)) break;
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    return { ok: false, reason: 'blocage après les jokers' };
  }
  if (!/tu as le BAC/.test(lastHtml.app)) return { ok: false, reason: 'la partie ne va pas au bout' };
  return { ok: true, end: 'annonce en 6ème, les trois jokers fonctionnent une fois, la partie va au bout' };
}

// ------------------------------------------------------------------ pause, sauvegarde, reprise
function runSaveResume() {
  var ui = boot();
  ui.click('start'); ui.click('m-bac'); ui.click('px');

  // quelques questions justes, puis pause → « m'arrêter ici »
  var steps = 0;
  while (steps++ < 12) {
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    return { ok: false, reason: 'blocage en début de partie' };
  }
  if (!ui.toQuestion()) return { ok: false, reason: 'aucune question avant la pause' };
  // le QCM est un choix définitif : aucun bouton ne doit ramener à la réponse libre
  if (!ui.click('openmc')) return { ok: false, reason: 'impossible d\'ouvrir le QCM' };
  if (/closemc/.test(lastHtml.app)) return { ok: false, reason: 'on peut revenir à la réponse libre après avoir vu le QCM' };
  if (document.getElementById('answer-form')) return { ok: false, reason: 'le champ de réponse libre reste ouvert avec le QCM' };
  if (!ui.option()) return { ok: false, reason: 'aucune proposition jouable' };
  if (!ui.toQuestion()) return { ok: false, reason: 'blocage après le QCM' };
  if (!ui.click('quit')) return { ok: false, reason: 'bouton Pause absent' };
  if (!/secondes/.test(lastHtml.app)) return { ok: false, reason: 'la pause n\'annonce pas son coût en temps' };
  if (/github\.io/.test(lastHtml.app)) return { ok: false, reason: 'l\'écran de pause montre une adresse' };
  if (!ui.click('p-save')) return { ok: false, reason: 'bouton « m\'arrêter ici » absent' };
  var slot = win.Scores.loadSlot();
  if (!slot || !slot.mode) return { ok: false, reason: 'aucune partie sauvegardée' };
  var saved = slot.score, level = slot.level || slot.levelName || '';

  // on relance l'app comme au lendemain : le bouton Reprendre doit être là
  ui = boot(true);
  if (!lastHtml.app.match(/id="resume"/)) return { ok: false, reason: 'pas de bouton Reprendre sur l\'écran-titre' };
  if (!ui.click('resume')) return { ok: false, reason: 'bouton Reprendre inactif' };
  if (!ui.toQuestion()) return { ok: false, reason: 'la reprise ne montre pas de question' };

  // et la partie reprise doit aller jusqu'au diplôme
  var loops = 0;
  while (loops++ < 600) {
    if (/tu as le BAC|Partie terminée/.test(lastHtml.app)) break;
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    return { ok: false, reason: 'blocage après la reprise' };
  }
  if (!/tu as le BAC/.test(lastHtml.app)) return { ok: false, reason: 'la partie reprise ne va pas au bout' };
  if (win.Scores.hasSlot()) return { ok: false, reason: 'la sauvegarde n\'est pas effacée à la fin' };
  return { ok: true, end: 'reprise puis diplôme (score sauvé : ' + saved + ' pts' + (level ? ' en ' + level : '') + ')' };
}

var fails = 0;
[
  ['Quizz BAC, sans faute', 'bac', 400, 'right', false, true],
  ['Quizz BAC, tout en QCM', 'bac', 400, 'right', true, true],
  ['Quizz BAC, une faute sur trois', 'bac', 2000, 'mixed', false, false],
  ['Quizz BAC, QCM une faute sur trois', 'bac', 2000, 'mixed', true, false],
  ['Quizz détente, sans faute', 'detente', 200, 'right', false, true],
  ['Quizz détente, tout faux', 'detente', 200, 'wrong', false, true],
  ['Quizz détente, tout en QCM', 'detente', 200, 'mixed', true, true],
  ['Quizz détente, une faute sur trois', 'detente', 200, 'mixed', false, true]
].forEach(function (t) {
  var res;
  try {
    res = run(t[0], t[1], t[2], t[3], t[4]);
    if (res.unfinished && !t[5]) res = { ok: true, steps: res.steps, end: 'partie encore en cours, aucun plantage' };
  } catch (e) {
    res = { ok: false, reason: 'EXCEPTION : ' + e.message, stack: (e.stack || '').split('\n').slice(0, 4).join('\n') };
  }
  if (res.ok) console.log('  ok   ' + t[0] + ' : partie terminée en ' + res.steps + ' étapes → ' + res.end);
  else {
    fails++;
    console.log('  FAIL ' + t[0] + ' : ' + res.reason);
    if (res.stack) console.log(res.stack);
    if (res.html) console.log('  écran : ' + res.html.replace(/\s+/g, ' '));
  }
});

var rl;
try { rl = runRules(); } catch (e) { rl = { ok: false, reason: 'EXCEPTION : ' + e.message }; }
if (rl.ok) console.log('  ok   Page des règles : ' + rl.end);
else { fails++; console.log('  FAIL Page des règles : ' + rl.reason); }

var jk;
try { jk = runJokers(); } catch (e) { jk = { ok: false, reason: 'EXCEPTION : ' + e.message }; }
if (jk.ok) console.log('  ok   Jokers : ' + jk.end);
else { fails++; console.log('  FAIL Jokers : ' + jk.reason); }

// ------------------------------------------------------------------ recommencer depuis la pause
function runRestart() {
  var ui = boot();
  ui.click('start'); ui.click('m-relax'); ui.click('px');

  // on avance de quelques questions pour avoir une partie « en cours »
  var steps = 0;
  while (steps++ < 8) {
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    break;
  }
  if (!ui.toQuestion()) return { ok: false, reason: 'aucune question avant la pause' };
  if (!ui.click('quit')) return { ok: false, reason: 'bouton Pause absent' };
  if (!/id="p-restart"/.test(lastHtml.app)) return { ok: false, reason: 'pas de bouton Recommencer sur la pause' };
  if (!ui.click('p-restart')) return { ok: false, reason: 'bouton Recommencer inactif' };
  if (!ui.toQuestion()) return { ok: false, reason: 'la nouvelle partie ne montre pas de question' };
  if (win.Scores.loadSlot()) return { ok: false, reason: 'l\'ancienne partie reste sauvegardée' };

  // la nouvelle partie doit repartir de zéro, et aller au bout
  var loops = 0;
  while (loops++ < 400) {
    if (/Quizz terminé/.test(lastHtml.app)) break;
    if (ui.answer()) continue;
    if (ui.option()) continue;
    if (ui.click('next')) continue;
    return { ok: false, reason: 'blocage après le redémarrage' };
  }
  if (loops >= 400) return { ok: false, reason: 'la partie relancée ne se termine pas' };
  return { ok: true, end: 'partie relancée depuis la pause, ancienne sauvegarde effacée, nouvelle partie menée au bout' };
}


var sr;
try { sr = runSaveResume(); } catch (e) { sr = { ok: false, reason: 'EXCEPTION : ' + e.message }; }
if (sr.ok) console.log('  ok   Pause, sauvegarde et reprise : ' + sr.end);
else { fails++; console.log('  FAIL Pause, sauvegarde et reprise : ' + sr.reason); }

var rs;
try { rs = runRestart(); } catch (e) { rs = { ok: false, reason: 'EXCEPTION : ' + e.message }; }
if (rs.ok) console.log('  ok   Recommencer depuis la pause : ' + rs.end);
else { fails++; console.log('  FAIL Recommencer depuis la pause : ' + rs.reason); }

console.log(fails ? '\n' + fails + ' parcours en échec' : '\nTous les parcours aboutissent.');
process.exit(fails ? 1 : 0);
