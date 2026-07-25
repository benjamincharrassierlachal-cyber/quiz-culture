/* Quiz Culture — moteur de jeu (logique pure, sans UI)
 * Utilisable en Node (tests) et dans le navigateur (prototype).
 * C'est ce fichier qui sera porté tel quel en TypeScript dans src/engine/.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = {
    questionsPerSubject: 1,   // 1 question par matière et par classe
    pointsFree: 2,
    pointsMC: 1,
    timerSeconds: 30,
    timeBuySeconds: 15,
    timeBuyCost: 1,
    mcOptions: 5,
    forceMCAfterFreeWrong: 1, // une réponse libre fausse ⇒ QCM imposé sur la question suivante
    resetScope: 'level',      // une erreur de QCM renvoie au début de la classe (matière 1)
    timeoutPenalty: 2         // timer expiré : −2 points, place conservée
  };

  // ---------- normalisation & comparaison des réponses libres ----------

  function normalize(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
      .replace(/\u00b2/g, '2').replace(/\u00b3/g, '3')  // exposants : cm2, 3x2
      .replace(/[\u2019']/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')                    // ponctuation
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(le|la|les|l|un|une|des|au|aux|en|the|a)\s+/, '')
      .trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  function tolerance(len) { return len <= 4 ? 0 : (len <= 8 ? 1 : 2); }

  var WORD_NUMBERS = {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
    huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14,
    quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
    soixante: 60, cent: 100, mille: 1000
  };

  function toNumber(s) {
    // /!\ la virgule décimale et le point doivent être traités AVANT normalize(),
    // qui supprime toute la ponctuation (« 6,25 » deviendrait « 6 25 » donc 6).
    var raw = String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/ /g, ' ')
      .replace(/(\d)\s+(\d)/g, '$1$2')     // « 3 200 » → « 3200 »
      .replace(/,/g, '.');
    // « moins 8 » (clavier ou dictée vocale) vaut -8
    var neg = /(^|\s)moins\s/.test(raw) ? -1 : 1;
    var m = raw.match(/-?\d+(?:\.\d+)?/);
    if (m) { var v = parseFloat(m[0]); return v < 0 ? v : neg * v; }
    var n = normalize(s);
    if (WORD_NUMBERS[n] !== undefined) return neg * WORD_NUMBERS[n];
    // formes composées simples : "cinquante-six", "vingt cinq"
    var parts = n.split(/[\s-]+/).filter(Boolean), total = 0, ok = parts.length > 0;
    parts.forEach(function (p) {
      if (WORD_NUMBERS[p] !== undefined) total += WORD_NUMBERS[p]; else ok = false;
    });
    return ok ? total : NaN;
  }

  /** Distance minimale entre une saisie et une liste de cibles. */
  function bestDistance(given, list) {
    var best = Infinity, bestLen = 0;
    (list || []).forEach(function (t) {
      var target = normalize(t);
      if (!target) return;
      var d = levenshtein(given, target);
      if (d < best) { best = d; bestLen = target.length; }
    });
    return { d: best, len: bestLen };
  }

  /** Une réponse libre est-elle acceptée ?
   *
   * Trois garde-fous contre les faux positifs de la tolérance orthographique :
   *  - les questions numériques sont comparées comme des nombres (pas de tolérance) ;
   *  - `strict: true` (orthographe, chiffres romains…) exige l'exactitude ;
   *  - une saisie plus proche d'un distracteur que de la bonne réponse est refusée,
   *    ce qui protège automatiquement les questions du type « pluriel de cheval ».
   */
  function checkFree(question, input) {
    var given = normalize(input);
    if (!given) return false;

    if (question.numeric) {
      var gn = toNumber(input);
      if (!isNaN(gn)) {
        for (var k = 0; k < question.accepted.length; k++) {
          var an = toNumber(question.accepted[k]);
          if (!isNaN(an) && an === gn) return true;
        }
      }
    }

    var acc = bestDistance(given, question.accepted);
    if (acc.d === 0) return true;
    if (question.strict) return false;
    if (question.numeric) return false;          // pas de tolérance sur les nombres
    if (acc.d > tolerance(acc.len)) return false;

    var dis = bestDistance(given, question.distractors);
    return acc.d < dis.d;                        // strictement plus proche de la bonne réponse
  }

  // ---------- utilitaires ----------

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- création de partie ----------

  function createGame(bank, options) {
    options = options || {};
    var cfg = Object.assign({}, CONFIG, options.config || {});
    var rng = options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);

    var pools = {};
    bank.questions.forEach(function (q) {
      var key = q.level + '|' + q.subject;
      (pools[key] = pools[key] || []).push(q);
    });

    var state = {
      config: cfg,
      levels: bank.levels,
      subjects: bank.subjects,
      pools: pools,
      rng: rng,
      levelIndex: options.levelIndex || 0,
      subjectIndex: options.subjectIndex || 0,
      qIndex: 0,                 // 0..questionsPerSubject-1
      score: 0,
      pointsSinceCheckpoint: 0,
      seen: [],                  // ids, ordre chronologique
      freeWrongStreak: 0,
      timeLeft: cfg.timerSeconds,
      current: null,
      options: [],               // options QCM mélangées
      finished: false,
      log: []
    };

    nextQuestion(state);
    return state;
  }

  function poolKey(state) {
    return state.levels[state.levelIndex] + '|' + state.subjects[state.subjectIndex];
  }

  /** Tire une question non vue du pool courant (anti-répétition). */
  function nextQuestion(state) {
    var pool = state.pools[poolKey(state)] || [];
    // banque incomplète : la partie s'arrête proprement au lieu de planter
    if (!pool.length) { state.current = null; state.finished = true; return null; }
    var currentId = state.current && state.current.id;
    var unseen = pool.filter(function (q) {
      return state.seen.indexOf(q.id) === -1 && q.id !== currentId;
    });
    if (!unseen.length) {
      // pool épuisé : on libère les plus anciennes vues de ce pool (FIFO)
      var ids = pool.map(function (q) { return q.id; });
      var keep = Math.ceil(pool.length * 0.2);
      var seenHere = state.seen.filter(function (id) { return ids.indexOf(id) !== -1; });
      var release = seenHere.slice(0, Math.max(1, seenHere.length - keep));
      state.seen = state.seen.filter(function (id) { return release.indexOf(id) === -1; });
      unseen = pool.filter(function (q) {
        return state.seen.indexOf(q.id) === -1 && q.id !== currentId;
      });
      if (!unseen.length) unseen = pool.slice();
    }
    var q = unseen[Math.floor(state.rng() * unseen.length)];
    state.current = q;
    state.options = shuffle([q.answer].concat(q.distractors.slice(0, state.config.mcOptions - 1)), state.rng);
    state.timeLeft = state.config.timerSeconds;
    return q;
  }

  function markSeen(state, q) {
    if (q && state.seen.indexOf(q.id) === -1) state.seen.push(q.id);
  }

  /** Le joueur est-il obligé de passer par le QCM ? */
  function mustUseMC(state) {
    var n = state.config.forceMCAfterFreeWrong;
    return n > 0 && state.freeWrongStreak >= n;
  }

  function award(state, points) {
    state.score += points;
    state.pointsSinceCheckpoint += points;
  }

  /** Bonne réponse : on avance dans la matière / le niveau. */
  function advance(state) {
    markSeen(state, state.current);
    state.freeWrongStreak = 0;
    state.qIndex++;
    var event = 'nextQuestion';
    if (state.qIndex >= state.config.questionsPerSubject) {
      state.qIndex = 0;
      state.subjectIndex++;
      event = 'subjectDone';
      if (state.subjectIndex >= state.subjects.length) {
        state.subjectIndex = 0;
        state.levelIndex++;
        state.pointsSinceCheckpoint = 0;   // palier : les points sont sécurisés
        event = 'levelUp';
        if (state.levelIndex >= state.levels.length) {
          state.finished = true;
          state.current = null;
          return 'gameWon';
        }
      }
    }
    nextQuestion(state);
    return event;
  }

  /** Retire des points sans toucher à la position. Le score ne descend jamais sous 0. */
  function penalize(state, points) {
    var actual = Math.min(points, state.score);
    state.score -= actual;
    state.pointsSinceCheckpoint = Math.max(0, state.pointsSinceCheckpoint - actual);
    return actual;
  }

  /** Échec « lourd » (erreur de QCM) : retour au début de la classe, perte des points du niveau. */
  function hardFail(state) {
    markSeen(state, state.current);
    var lost = state.pointsSinceCheckpoint;
    state.score -= lost;
    if (state.score < 0) state.score = 0;
    state.pointsSinceCheckpoint = 0;
    state.qIndex = 0;
    if (state.config.resetScope === 'level') state.subjectIndex = 0;  // on repart de la 1re matière
    state.freeWrongStreak = 0;
    nextQuestion(state);
    return lost;
  }

  // ---------- actions du joueur ----------

  function answerFree(state, input) {
    if (state.finished) return { ok: false, reason: 'finished' };
    if (mustUseMC(state)) return { ok: false, reason: 'mcForced' };
    var q = state.current;
    var correct = checkFree(q, input);
    var res = { mode: 'free', correct: correct, question: q, given: input, points: 0, lost: 0 };
    if (correct) {
      award(state, state.config.pointsFree);
      res.points = state.config.pointsFree;
      res.event = advance(state);
    } else {
      // aucune perte de points ni de position : une autre question est proposée
      state.freeWrongStreak++;
      markSeen(state, q);
      nextQuestion(state);
      res.event = 'replaced';
      res.mcForced = mustUseMC(state);
    }
    state.log.push(res);
    return res;
  }

  function answerMC(state, choice) {
    if (state.finished) return { ok: false, reason: 'finished' };
    var q = state.current;
    var correct = normalize(choice) === normalize(q.answer);
    var res = { mode: 'mc', correct: correct, question: q, given: choice, points: 0, lost: 0 };
    if (correct) {
      award(state, state.config.pointsMC);
      res.points = state.config.pointsMC;
      res.event = advance(state);
    } else {
      res.lost = hardFail(state);
      res.event = 'resetToFirst';
    }
    state.log.push(res);
    return res;
  }

  /** Sacrifier 1 point pour +15 s. */
  function buyTime(state) {
    if (state.finished) return { ok: false, reason: 'finished' };
    if (state.score < state.config.timeBuyCost) return { ok: false, reason: 'noPoints' };
    penalize(state, state.config.timeBuyCost);  // les points dépensés ne peuvent plus être perdus
    state.timeLeft += state.config.timeBuySeconds;
    return { ok: true, timeLeft: state.timeLeft, score: state.score };
  }

  /** Le timer arrive à zéro : −2 points, nouvelle question, place conservée. */
  function timeout(state) {
    if (state.finished) return { ok: false, reason: 'finished' };
    var q = state.current;
    var res = { mode: 'timeout', correct: false, question: q, points: 0, lost: 0 };
    res.lost = penalize(state, state.config.timeoutPenalty);
    markSeen(state, q);
    nextQuestion(state);
    res.event = 'replaced';
    state.log.push(res);
    return res;
  }

  function progress(state) {
    return {
      level: state.levels[state.levelIndex],
      subject: state.subjects[state.subjectIndex],
      question: state.qIndex + 1,
      of: state.config.questionsPerSubject,
      step: state.subjectIndex + 1,          // avancement dans la classe (1 → 5)
      steps: state.subjects.length,
      score: state.score,
      atRisk: state.pointsSinceCheckpoint,
      mcForced: mustUseMC(state)
    };
  }

  return {
    CONFIG: CONFIG,
    normalize: normalize,
    levenshtein: levenshtein,
    toNumber: toNumber,
    checkFree: checkFree,
    createGame: createGame,
    nextQuestion: nextQuestion,
    answerFree: answerFree,
    answerMC: answerMC,
    buyTime: buyTime,
    timeout: timeout,
    mustUseMC: mustUseMC,
    progress: progress,
    mulberry32: mulberry32
  };
});
