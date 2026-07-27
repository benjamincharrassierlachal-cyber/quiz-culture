/* Quiz Culture — moteur de jeu v0.3 (logique pure, sans UI)
 *
 * Deux modes :
 *   - « bac »     : parcours CP → Terminale, 1 question par matière, cœurs, bonus de classe.
 *   - « detente » : 30 questions à thèmes, difficulté croissante, aucune pénalité.
 *
 * Utilisable en Node (tests) et dans le navigateur (prototype).
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
    forceMCAfterFreeWrong: 1, // une réponse libre fausse ⇒ QCM imposé sur la suivante
    resetScope: 'level',      // une erreur de QCM renvoie au début de la classe
    timeoutPenalty: 2,        // timer expiré : −2 points, place conservée
    lives: 3,                 // cœurs : un perdu à chaque retour en début de classe
    perfectBonusPoints: 2,    // classe sans faute au primaire
    perfectBonusLife: 1,      // classe sans faute au secondaire
    bonusLifeFromLevel: 5,    // index de la 6ème : à partir de là, le bonus est une vie
    relaxQuestions: 30,       // mode détente
    relaxTiers: 3             // 3 paliers de difficulté (10 questions chacun)
  };

  // ---------------------------------------------------------------- normalisation

  function normalize(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
      .replace(/\u00b2/g, '2').replace(/\u00b3/g, '3')  // exposants : cm2, 3x2
      .replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')  // ligatures : coeur, curriculum vitae
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
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
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
    // /!\ virgule et point traités AVANT normalize(), qui supprime la ponctuation
    var raw = String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/ /g, ' ')
      .replace(/(\d)\s+(\d)/g, '$1$2')     // « 3 200 » → « 3200 »
      .replace(/,/g, '.');
    var neg = /(^|\s)moins\s/.test(raw) ? -1 : 1;   // « moins 8 » vaut -8
    var m = raw.match(/-?\d+(?:\.\d+)?/);
    if (m) { var v = parseFloat(m[0]); return v < 0 ? v : neg * v; }
    var n = normalize(s);
    if (WORD_NUMBERS[n] !== undefined) return neg * WORD_NUMBERS[n];
    var parts = n.split(/[\s-]+/).filter(Boolean), total = 0, ok = parts.length > 0;
    parts.forEach(function (p) {
      if (WORD_NUMBERS[p] !== undefined) total += WORD_NUMBERS[p]; else ok = false;
    });
    return ok ? neg * total : NaN;
  }

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

  /** Une réponse libre est-elle acceptée ? (trois garde-fous, voir DESIGN §2) */
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
    if (question.strict || question.numeric) return false;
    if (acc.d > tolerance(acc.len)) return false;
    return acc.d < bestDistance(given, question.distractors).d;
  }

  // ---------------------------------------------------------------- utilitaires

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

  function makeOptions(state, q) {
    return shuffle([q.answer].concat(q.distractors.slice(0, state.config.mcOptions - 1)), state.rng);
  }

  function rngFor(options) {
    return options.rng || (options.seed !== undefined ? mulberry32(options.seed) : Math.random);
  }

  // ---------------------------------------------------------------- mode BAC

  function createGame(bank, options) {
    options = options || {};
    var cfg = Object.assign({}, CONFIG, options.config || {});

    var pools = {};
    bank.questions.forEach(function (q) {
      var key = q.level + '|' + q.subject;
      (pools[key] = pools[key] || []).push(q);
    });

    // les matières d'une classe = celles qui ont réellement des questions,
    // dans l'ordre global : les Sciences apparaissent donc d'elles-mêmes à partir de la 6ème
    var levelSubjects = {};
    bank.levels.forEach(function (lv) {
      levelSubjects[lv] = bank.subjects.filter(function (s) { return (pools[lv + '|' + s] || []).length > 0; });
    });

    var state = {
      mode: 'bac',
      config: cfg,
      levels: bank.levels,
      subjects: bank.subjects,
      levelSubjects: levelSubjects,
      pools: pools,
      rng: rngFor(options),
      levelIndex: options.levelIndex || 0,
      subjectIndex: 0,
      qIndex: 0,
      score: 0,
      pointsSinceCheckpoint: 0,
      lives: cfg.lives,
      classErrors: 0,           // fautes depuis le début de la classe (pour le bonus)
      levelPoints: [],          // points acquis par classe validée (rendus en cas de rétrogradation)
      seen: (options.seen || []).slice(),
      freeWrongStreak: 0,
      timeLeft: cfg.timerSeconds,
      current: null,
      options: [],
      finished: false,
      won: false,
      log: []
    };

    nextQuestion(state);
    return state;
  }

  function subjectsOf(state) { return state.levelSubjects[state.levels[state.levelIndex]] || []; }
  function poolKey(state) { return state.levels[state.levelIndex] + '|' + subjectsOf(state)[state.subjectIndex]; }

  /** Tire une question non vue du pool courant (anti-répétition). */
  function nextQuestion(state) {
    var pool = state.pools[poolKey(state)] || [];
    if (!pool.length) { state.current = null; state.finished = true; return null; }
    var currentId = state.current && state.current.id;
    var unseen = pool.filter(function (q) {
      return state.seen.indexOf(q.id) === -1 && q.id !== currentId;
    });
    if (!unseen.length) {
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
    state.options = makeOptions(state, q);
    state.timeLeft = state.config.timerSeconds;
    return q;
  }

  function markSeen(state, q) {
    if (q && state.seen.indexOf(q.id) === -1) state.seen.push(q.id);
  }

  function mustUseMC(state) {
    var n = state.config.forceMCAfterFreeWrong;
    return state.mode === 'bac' && n > 0 && state.freeWrongStreak >= n;
  }

  function award(state, points) {
    state.score += points;
    if (state.mode === 'bac') state.pointsSinceCheckpoint += points;
  }

  function penalize(state, points) {
    var actual = Math.min(points, state.score);
    state.score -= actual;
    if (state.mode === 'bac') {
      state.pointsSinceCheckpoint = Math.max(0, state.pointsSinceCheckpoint - actual);
    }
    return actual;
  }

  /** Classe validée : bonus si aucune faute depuis le début de la classe. */
  function classBonus(state) {
    if (state.classErrors > 0) return null;
    var cfg = state.config;
    if (state.levelIndex >= cfg.bonusLifeFromLevel) {
      state.lives += cfg.perfectBonusLife;
      return { kind: 'life', amount: cfg.perfectBonusLife };
    }
    state.score += cfg.perfectBonusPoints;      // hors pointsSinceCheckpoint : acquis au palier
    return { kind: 'points', amount: cfg.perfectBonusPoints };
  }

  /** Bonne réponse : on avance dans la classe. */
  function advance(state) {
    markSeen(state, state.current);
    state.freeWrongStreak = 0;
    state.qIndex++;
    var event = 'nextQuestion';
    state.bonus = null;
    if (state.qIndex >= state.config.questionsPerSubject) {
      state.qIndex = 0;
      state.subjectIndex++;
      event = 'subjectDone';
      if (state.subjectIndex >= subjectsOf(state).length) {
        state.bonus = classBonus(state);
        // on mémorise ce que la classe a rapporté : c'est ce qu'on reperdra si on y redescend,
        // sinon une rétrogradation permettrait de gagner deux fois les mêmes points
        state.levelPoints[state.levelIndex] = state.pointsSinceCheckpoint +
          ((state.bonus && state.bonus.kind === 'points') ? state.bonus.amount : 0);
        state.subjectIndex = 0;
        state.levelIndex++;
        state.pointsSinceCheckpoint = 0;   // palier : les points sont sécurisés
        state.classErrors = 0;
        event = 'levelUp';
        if (state.levelIndex >= state.levels.length) {
          state.finished = true;
          state.won = true;
          state.current = null;
          return 'gameWon';
        }
      }
    }
    nextQuestion(state);
    return event;
  }

  /** Erreur de QCM : retour au début de la classe, perte des points de la classe et d'un cœur. */
  function hardFail(state) {
    markSeen(state, state.current);
    var lost = state.pointsSinceCheckpoint;
    state.score -= lost;
    if (state.score < 0) state.score = 0;
    state.pointsSinceCheckpoint = 0;
    state.qIndex = 0;
    if (state.config.resetScope === 'level') state.subjectIndex = 0;
    state.freeWrongStreak = 0;
    state.classErrors++;
    state.lives--;
    var demoted = false, given = 0;
    if (state.lives <= 0) {                      // plus de cœur : on redescend d'une classe
      state.lives = state.config.lives;
      if (state.levelIndex > 0) {
        state.levelIndex--; demoted = true;
        given = state.levelPoints[state.levelIndex] || 0;   // la classe redevient à refaire
        state.levelPoints[state.levelIndex] = 0;
        state.score = Math.max(0, state.score - given);
      }
      state.classErrors = 0;
    }
    nextQuestion(state);
    return { lost: lost + given, demoted: demoted, lives: state.lives, given: given };
  }

  // ---------------------------------------------------------------- mode détente

  /** 30 questions, thèmes mélangés, difficulté croissante par paliers de 10. */
  function createRelax(bank, options) {
    options = options || {};
    var cfg = Object.assign({}, CONFIG, options.config || {});
    var rng = rngFor(options);
    var total = cfg.relaxQuestions, tiers = cfg.relaxTiers, perTier = Math.round(total / tiers);

    var byTier = {};
    bank.questions.forEach(function (q) {
      var t = Math.min(tiers, Math.max(1, q.difficulty || 2));
      (byTier[t] = byTier[t] || []).push(q);
    });

    var queue = [], used = {};
    for (var t = 1; t <= tiers; t++) {
      var wanted = (t === tiers) ? total - queue.length : perTier;
      var pool = shuffle((byTier[t] || []).filter(function (q) { return !used[q.id]; }), rng);
      // pas assez de questions dans ce palier : on complète avec les paliers voisins
      if (pool.length < wanted) {
        var extra = shuffle(bank.questions.filter(function (q) {
          return !used[q.id] && pool.indexOf(q) === -1;
        }), rng);
        pool = pool.concat(extra);
      }
      pool.slice(0, wanted).forEach(function (q) { used[q.id] = 1; queue.push(q); });
    }

    var state = {
      mode: 'detente',
      config: cfg,
      themes: bank.themes || [],
      rng: rng,
      queue: queue,
      index: 0,
      score: 0,
      pointsSinceCheckpoint: 0,
      correctCount: 0,
      lives: 0,
      seen: [],
      freeWrongStreak: 0,
      timeLeft: cfg.timerSeconds,
      current: queue[0] || null,
      options: [],
      finished: !queue.length,
      won: false,
      log: []
    };
    if (state.current) state.options = makeOptions(state, state.current);
    return state;
  }

  /** Détente : on passe simplement à la question suivante, juste ou faux. */
  function relaxNext(state) {
    state.index++;
    state.freeWrongStreak = 0;
    if (state.index >= state.queue.length) {
      state.finished = true; state.won = true; state.current = null;
      return 'gameWon';
    }
    state.current = state.queue[state.index];
    state.options = makeOptions(state, state.current);
    state.timeLeft = state.config.timerSeconds;
    return 'nextQuestion';
  }

  // ---------------------------------------------------------------- actions du joueur

  function answerFree(state, input) {
    if (state.finished) return { ok: false, reason: 'finished' };
    if (mustUseMC(state)) return { ok: false, reason: 'mcForced' };
    var q = state.current;
    var correct = checkFree(q, input);
    var res = { mode: 'free', correct: correct, question: q, given: input, points: 0, lost: 0 };

    if (state.mode === 'detente') {
      if (correct) { award(state, state.config.pointsFree); res.points = state.config.pointsFree; state.correctCount++; }
      res.event = relaxNext(state);
      state.log.push(res);
      return res;
    }

    if (correct) {
      award(state, state.config.pointsFree);
      res.points = state.config.pointsFree;
      res.event = advance(state);
      res.bonus = state.bonus;
    } else {
      state.freeWrongStreak++;
      state.classErrors++;                 // une réponse libre fausse annule le bonus de classe
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

    if (state.mode === 'detente') {
      if (correct) { award(state, state.config.pointsMC); res.points = state.config.pointsMC; state.correctCount++; }
      res.event = relaxNext(state);
      state.log.push(res);
      return res;
    }

    if (correct) {
      award(state, state.config.pointsMC);
      res.points = state.config.pointsMC;
      res.event = advance(state);
      res.bonus = state.bonus;
    } else {
      var f = hardFail(state);
      res.lost = f.lost;
      res.demoted = f.demoted;
      res.lives = f.lives;
      res.event = f.demoted ? 'demoted' : 'resetToFirst';
    }
    state.log.push(res);
    return res;
  }

  /** Sacrifier 1 point pour +15 s (les deux modes). */
  function buyTime(state) {
    if (state.finished) return { ok: false, reason: 'finished' };
    if (state.score < state.config.timeBuyCost) return { ok: false, reason: 'noPoints' };
    penalize(state, state.config.timeBuyCost);
    state.timeLeft += state.config.timeBuySeconds;
    return { ok: true, timeLeft: state.timeLeft, score: state.score };
  }

  /** Le timer arrive à zéro. */
  function timeout(state) {
    if (state.finished) return { ok: false, reason: 'finished' };
    var q = state.current;
    var res = { mode: 'timeout', correct: false, question: q, points: 0, lost: 0 };
    if (state.mode === 'detente') {
      res.event = relaxNext(state);
      state.log.push(res);
      return res;
    }
    res.lost = penalize(state, state.config.timeoutPenalty);
    state.classErrors++;
    markSeen(state, q);
    nextQuestion(state);
    res.event = 'replaced';
    state.log.push(res);
    return res;
  }

  function progress(state) {
    if (state.mode === 'detente') {
      return {
        mode: 'detente',
        question: state.index + 1,
        of: state.queue.length,
        theme: state.current ? state.current.theme : null,
        score: state.score,
        correct: state.correctCount,
        mcForced: false
      };
    }
    var subs = subjectsOf(state);
    return {
      mode: 'bac',
      level: state.levels[state.levelIndex],
      subject: subs[state.subjectIndex],
      subjects: subs,
      question: state.qIndex + 1,
      of: state.config.questionsPerSubject,
      step: state.subjectIndex + 1,
      steps: subs.length,
      score: state.score,
      atRisk: state.pointsSinceCheckpoint,
      lives: state.lives,
      perfectSoFar: state.classErrors === 0,
      mcForced: mustUseMC(state)
    };
  }

  /** Score maximum théorique d'une partie parfaite (bonus compris). */
  function maxScore(bank) {
    var pools = {};
    bank.questions.forEach(function (q) { pools[q.level + '|' + q.subject] = 1; });
    var total = 0;
    bank.levels.forEach(function (lv, i) {
      var n = bank.subjects.filter(function (s) { return pools[lv + '|' + s]; }).length;
      total += n * CONFIG.pointsFree;
      if (i < CONFIG.bonusLifeFromLevel) total += CONFIG.perfectBonusPoints;
    });
    return total;
  }

  return {
    CONFIG: CONFIG,
    normalize: normalize,
    levenshtein: levenshtein,
    toNumber: toNumber,
    checkFree: checkFree,
    createGame: createGame,
    createRelax: createRelax,
    nextQuestion: nextQuestion,
    answerFree: answerFree,
    answerMC: answerMC,
    buyTime: buyTime,
    timeout: timeout,
    mustUseMC: mustUseMC,
    progress: progress,
    maxScore: maxScore,
    mulberry32: mulberry32
  };
});
