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

var optionEls = [];
var document = {
  hidden: false, addEventListener: function () {},
  getElementById: function (id) { var e = el(id); return e.present === false ? null : e; },
  querySelector: function () { return null; },
  querySelectorAll: function (sel) {
    if (sel !== '[data-opt]') return [];
    // cinq propositions de QCM, dont on ignore le contenu : on clique par indice
    optionEls = [0, 1, 2, 3, 4].map(function (i) {
      var e = { _attrs: { 'data-opt': String(i) }, getAttribute: function (k) { return this._attrs[k]; }, onclick: null };
      return e;
    });
    return optionEls;
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
    if (!viaQcm && click('send')) continue;         // valider une réponse libre
    if (optionEls.length && optionEls[0].onclick) { optionEls[0].onclick(); drain(); continue; }
    if (click('next')) continue;                    // carte / palier
    if (click('again')) continue;                   // écran de fin : rejouer
    return { ok: false, steps: steps, reason: 'aucun bouton actif', html: html.slice(0, 400) };
  }
  return { ok: false, steps: steps, reason: 'trop d\'étapes', unfinished: true };
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

console.log(fails ? '\n' + fails + ' parcours en échec' : '\nLes deux modes se terminent proprement.');
process.exit(fails ? 1 : 0);
