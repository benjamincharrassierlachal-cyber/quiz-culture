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
    speedBonusPoints: 1,        // prime de rapidité, réservée à la réponse libre
    speedBonusWithin: 10,       // accordée si l'on répond avant la 11ème seconde
    speedBonusFromLevel: 3,     // mode BAC : à partir du CM1
    speedBonusFromQuestion: 15, // mode détente : à partir de la 15ème question
    mcOptions: 5,
    forceMCAfterFreeWrong: 1, // une réponse libre fausse ⇒ QCM imposé sur la suivante
    resetScope: 'level',      // une erreur de QCM renvoie au début de la classe
    timeoutPenalty: 2,        // timer expiré : −2 points, place conservée
    lives: 3,                 // cœurs : un perdu à chaque retour en début de classe
    perfectBonusPoints: 2,    // classe sans faute au primaire
    perfectBonusLife: 1,      // classe sans faute au secondaire
    bonusLifeFromLevel: 5,    // index de la 6ème : à partir de là, le bonus est une vie
    lyceeFromLevel: 9,        // index de la 2nde : le lycée a ses propres règles
    lyceeLives: 5,            // cinq cœurs neufs à chaque classe du lycée, sans cumul
    lyceePerfectPoints: 5,    // classe parfaite au lycée : des points, les cœurs étant remis à neuf
    relaxQuestions: 30,       // mode détente
    relaxTiers: 3,            // 3 paliers de difficulté (10 questions chacun)
    jokerCost: 6,             // chaque joker coûte 6 points
    jokersFromLevel: 5,       // disponibles à partir de la 6ème
    jokerHideCount: 3,        // « 40/60 » : trois mauvaises réponses barrées
    resumeMinSeconds: 5,      // à la reprise, on garde le temps restant, jamais moins de 5 s
    pausePenaltySeconds: 20   // chaque pause ajoute 20 s au temps de jeu (départage du classement)
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
      // déterminants en tête, y compris enchaînés : « de la Terre » ≡ « la Terre » ≡ « Terre »
      .replace(/^(?:(?:le|la|les|l|un|une|des|de|du|d|au|aux|en|the|a)\s+)+/, '')
      .trim();
  }

  /* Normalisation des formules : contrairement à normalize(), elle CONSERVE les symboles.
   * Pour « 2x² + 5x − 12 », le signe est toute la réponse : le retirer revenait à confondre
   * l'énoncé juste avec son leurre. On ramène seulement les variantes typographiques d'un
   * même symbole à une écriture unique — moins Unicode et tiret, × et x, ² et ^2. */
  var EXPOSANTS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

  function normalizeStrict(s) {
    if (s === null || s === undefined) return '';
    var t = String(s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[⁰¹²³⁴-⁹⁻]/g, function (c) {
      return '^' + EXPOSANTS[c];
    });
    return t
      .replace(/\^\^/g, '^')                       // deux exposants collés : 10⁻⁴ → 10^-4
      .replace(/\^-\^/g, '^-')
      .replace(/[−–—]/g, '-')       // moins Unicode, tirets longs
      .replace(/[×⋅∗*]/g, 'x')      // × · ∗ * → x
      .replace(/[÷∕]/g, '/')
      .replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/[’']/g, '')
      .replace(/,(\d)/g, '.$1')                    // 7,2 → 7.2
      .replace(/\s+/g, '')                         // les espaces ne portent aucun sens ici
      .trim();
  }

  /** Valeur d'une fraction, d'un pourcentage ou d'un décimal : « 2/10 », « 20 % » et « 0,2 »
   *  donnent tous 0.2. NaN si l'écriture n'est pas de cette forme. */
  function toRational(s) {
    var raw = String(s === null || s === undefined ? '' : s)
      .toLowerCase()
      .replace(/\s| /g, '')
      .replace(/,/g, '.')
      .replace(/^[+]/, '');
    var m = raw.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
    if (m) {
      var den = parseFloat(m[2]);
      return den === 0 ? NaN : parseFloat(m[1]) / den;
    }
    if (/^-?\d+(?:\.\d+)?%$/.test(raw)) return parseFloat(raw) / 100;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return parseFloat(raw);
    return NaN;
  }

  /** Deux écritures désignent-elles la même valeur ? « 1/5 » et « 2/10 », oui. */
  function sameValue(a, b) {
    var x = toRational(a), y = toRational(b);
    return !isNaN(x) && !isNaN(y) && Math.abs(x - y) < 1e-9;
  }

  /* Distance de Damerau-Levenshtein : comme Levenshtein, mais l'inversion de deux
   * lettres voisines ne coûte qu'un point. C'est la faute de frappe la plus courante
   * — « Zoal » pour « Zola », « oublié » pour « oublie » — et la compter double
   * revenait à refuser des réponses manifestement justes. */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var av = new Array(b.length + 1), prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) { prev[j] = j; av[j] = 0; }
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], av[j - 2] + 1);          // deux lettres inversées
        }
      }
      for (j = 0; j <= b.length; j++) { av[j] = prev[j]; prev[j] = cur[j]; }
    }
    return prev[b.length];
  }

  /* Fautes de frappe tolérées, selon la longueur de la réponse attendue.
   * Une lettre dès 4 caractères : « Zoal » pour « Zola » passe. Le garde-fou des
   * distracteurs empêche qu'une tolérance élargie fasse accepter une autre réponse. */
  function tolerance(len) {
    return len <= 3 ? 0 : (len <= 7 ? 1 : (len <= 12 ? 2 : 3));
  }

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

  /** Range les membres d'une énumération dans l'ordre alphabétique, chacun débarrassé de
   *  son déterminant : « l'Église et l'État » et « l'État et l'Église » deviennent la même
   *  chaîne. Sans cela, inverser deux termes coûtait une dizaine de fautes de frappe. */
  function sortParts(s) {
    var parts = String(s).split(/\s+(?:et|and)\s+/);
    if (parts.length < 2) return s;
    return parts
      .map(function (p) {
        return p.replace(/^(?:(?:le|la|les|l|un|une|des|de|du|d|au|aux|en|the|a)\s+)+/, '').trim();
      })
      .filter(Boolean)
      .sort()
      .join(' et ');
  }

  function bestDistance(given, list) {
    var best = Infinity, bestLen = 0;
    var givenSorted = sortParts(given);
    (list || []).forEach(function (t) {
      var target = normalize(t);
      if (!target) return;
      // on retient la meilleure des deux lectures : ordre d'origine, ou membres rangés
      var d = Math.min(levenshtein(given, target), levenshtein(givenSorted, sortParts(target)));
      if (d < best) { best = d; bestLen = target.length; }
    });
    return { d: best, len: bestLen };
  }

  /** Une réponse libre est-elle acceptée ? (trois garde-fous, voir DESIGN §2) */
  function checkFree(question, input) {
    /* Formules : comparaison symbole à symbole, aucune tolérance — un signe change tout.
     * On sort ici, sans repasser par la comparaison souple : celle-ci efface justement
     * les symboles et confondrait la bonne réponse avec son leurre. */
    if (question.strict) {
      var f = normalizeStrict(input);
      if (!f) return false;
      // le chapeau de l'exposant est introuvable sur un clavier de téléphone : « 2x2 » vaut « 2x² ».
      // Les signes, eux, restent décisifs — c'est là toute la différence avec la comparaison souple.
      var plat = function (x) { return x.replace(/\^/g, ''); };
      var cibles = [question.answer].concat(question.accepted || []);
      for (var s = 0; s < cibles.length; s++) {
        var g = normalizeStrict(cibles[s]);
        if (f === g || plat(f) === plat(g)) return true;
        if (sameValue(input, cibles[s])) return true;   // 2/10 vaut toujours 1/5
      }
      return false;
    }

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

    // même valeur écrite autrement : 2/10 vaut 1/5, 50 % vaut 1/2, 0,25 vaut 1/4
    for (var v = 0; v < question.accepted.length; v++) {
      if (sameValue(input, question.accepted[v])) return true;
    }

    var acc = bestDistance(given, question.accepted);
    if (acc.d === 0) return true;
    if (question.numeric) return false;

    /* Réponse plus bavarde que la réponse attendue : « Général de Gaulle » pour « de Gaulle »,
     * « les instruments à cordes » pour « les cordes ». Le joueur sait, il en dit seulement plus.
     * On accepte si la réponse attendue s'y retrouve mot pour mot, avec au plus trois mots en plus.
     *
     * Deux verrous, et le premier est indispensable : beaucoup de mauvais choix sont justement
     * des EXTENSIONS de la bonne réponse — « Napoléon III » contient « Napoléon », « moins
     * l'infini » contient « infini », « une presqu'île » contient « île ». Une réponse identique
     * à une proposition fausse est donc toujours refusée, quoi qu'elle contienne. */
    if (enrobee(given, question.accepted)
        && bestDistance(given, question.distractors).d !== 0
        && !enrobee(given, question.distractors)) return true;

    if (acc.d > tolerance(acc.len)) return false;
    return acc.d < bestDistance(given, question.distractors).d;
  }

  var MOTS_EN_TROP = 3;

  /** L'une des cibles apparaît-elle mot pour mot dans la réponse donnée ? */
  function enrobee(given, cibles) {
    var g = given.split(' ').filter(Boolean);
    for (var i = 0; i < (cibles || []).length; i++) {
      var t = normalize(cibles[i]).split(' ').filter(Boolean);
      if (!t.length || g.length <= t.length || g.length - t.length > MOTS_EN_TROP) continue;
      for (var d = 0; d + t.length <= g.length; d++) {
        var ok = true;
        for (var j = 0; j < t.length; j++) {
          if (g[d + j] !== t[j]) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
    return false;
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
      budget: cfg.timerSeconds,     // secondes accordées pour la question en cours
      spent: 0,                     // temps de jeu cumulé, hors pauses
      pauses: 0,                    // nombre de pauses, chacune pénalisée au temps
      jokers: { fifty: true, swap: true, pass: true },
      hiddenWrong: [],              // mauvaises réponses barrées par le joker 40/60
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
    state.budget = state.config.timerSeconds;
    state.hiddenWrong = [];
    return q;
  }

  function markSeen(state, q) {
    if (q && state.seen.indexOf(q.id) === -1) state.seen.push(q.id);
  }

  function mustUseMC(state) {
    var n = state.config.forceMCAfterFreeWrong;
    return state.mode === 'bac' && n > 0 && state.freeWrongStreak >= n;
  }

  /** La prime de rapidité est-elle ouverte à ce stade de la partie ?
   *  Détente : à partir de la 15ème question. BAC : à partir du CM1. */
  function speedOpen(state) {
    if (!state) return false;
    if (state.mode === 'detente') {
      return (state.index + 1) >= state.config.speedBonusFromQuestion;
    }
    return state.levelIndex >= state.config.speedBonusFromLevel;
  }

  /** Secondes écoulées sur la question en cours. */
  function elapsedOnQuestion(state) {
    var budget = state.budget || state.config.timerSeconds;
    return Math.max(0, budget - state.timeLeft);
  }

  /** Points de rapidité gagnés sur cette réponse — 0 si trop lent ou pas encore ouverte. */
  function speedBonus(state) {
    if (!speedOpen(state)) return 0;
    return elapsedOnQuestion(state) <= state.config.speedBonusWithin
      ? state.config.speedBonusPoints : 0;
  }

  /** Ajoute au compteur de temps ce que la question vient de coûter. */
  function tickSpent(state) {
    var used = (state.budget || state.config.timerSeconds) - state.timeLeft;
    state.spent = Math.round((state.spent || 0) + Math.max(0, used));
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
    // au lycée, les cœurs sont remis à neuf à chaque classe : un cœur de bonus n'y vaudrait rien
    if (state.levelIndex >= cfg.lyceeFromLevel) {
      state.score += cfg.lyceePerfectPoints;
      return { kind: 'points', amount: cfg.lyceePerfectPoints };
    }
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
        /* Au lycée, chaque classe repart avec cinq cœurs neufs : ils mesurent le droit à
         * l'erreur dans la classe en cours, ils ne se cumulent plus d'une classe à l'autre.
         * Et l'entrée en 2nde rend les trois jokers, qui devront tenir jusqu'au BAC. */
        if (state.levelIndex >= state.config.lyceeFromLevel &&
            state.levelIndex < state.levels.length) {
          state.lives = state.config.lyceeLives;
          if (state.levelIndex === state.config.lyceeFromLevel) {
            state.jokers = { fifty: true, swap: true, pass: true };
          }
        }
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

  /** Sommes-nous au lycée ? À partir de la 2nde, la sanction change de nature. */
  function auLycee(state) {
    return state.mode === 'bac' && state.levelIndex >= state.config.lyceeFromLevel;
  }

  /* Erreur de QCM.
   *
   * Jusqu'à la 3ème : retour au début de la classe, points de la classe perdus, un cœur en moins,
   * et une rétrogradation quand il n'en reste plus.
   *
   * Au lycée : une simple autre question de la même matière, un cœur en moins. Ce n'est qu'à
   * court de cœurs que la classe recommence — et on ne redescend jamais en dessous de la 2nde.
   * Mesuré : à la moitié de bonnes réponses, l'ancienne règle laissait 5 % des joueurs
   * atteindre le BAC, contre l'essentiel avec celle-ci. Le lycée était un piège, pas un défi. */
  function hardFail(state) {
    markSeen(state, state.current);
    var lycee = auLycee(state);
    var lost = 0, demoted = false, given = 0, repli = false;

    state.freeWrongStreak = 0;
    state.classErrors++;
    state.lives--;
    state.qIndex = 0;

    if (!lycee) {
      lost = state.pointsSinceCheckpoint;
      state.score = Math.max(0, state.score - lost);
      state.pointsSinceCheckpoint = 0;
      if (state.config.resetScope === 'level') state.subjectIndex = 0;
      if (state.lives <= 0) {
        state.lives = state.config.lives;
        if (state.levelIndex > 0) {
          state.levelIndex--; demoted = true;
          given = state.levelPoints[state.levelIndex] || 0;
          state.levelPoints[state.levelIndex] = 0;
          state.score = Math.max(0, state.score - given);
        }
        state.classErrors = 0;
      }
    } else if (state.lives <= 0) {               // lycée, cœurs épuisés : la classe recommence
      lost = state.pointsSinceCheckpoint;
      state.score = Math.max(0, state.score - lost);
      state.pointsSinceCheckpoint = 0;
      state.subjectIndex = 0;
      state.lives = state.config.lyceeLives;
      state.classErrors = 0;
      repli = true;
    }
    // au lycée avec des cœurs restants : on ne touche ni aux points ni à la matière,
    // nextQuestion() se charge d'en proposer une autre dans la même matière

    nextQuestion(state);
    return { lost: lost + given, demoted: demoted, lives: state.lives, given: given, repli: repli };
  }

  // ---------------------------------------------------------------- mode détente

  /** 30 questions, thèmes mélangés, difficulté croissante par paliers de 10.
   *  Les questions déjà vues lors des parties précédentes passent en dernier recours :
   *  sans cela, on retombe vite sur les mêmes d'une partie à l'autre. */
  function createRelax(bank, options) {
    options = options || {};
    var cfg = Object.assign({}, CONFIG, options.config || {});
    var rng = rngFor(options);
    var total = cfg.relaxQuestions, tiers = cfg.relaxTiers, perTier = Math.round(total / tiers);
    var seen = (options.seen || []).slice();
    var isSeen = {};
    seen.forEach(function (id) { isSeen[id] = 1; });

    var byTier = {};
    bank.questions.forEach(function (q) {
      var t = Math.min(tiers, Math.max(1, q.difficulty || 2));
      (byTier[t] = byTier[t] || []).push(q);
    });

    var queue = [], used = {};
    for (var t = 1; t <= tiers; t++) {
      var wanted = (t === tiers) ? total - queue.length : perTier;
      var all = (byTier[t] || []).filter(function (q) { return !used[q.id]; });
      // d'abord les questions jamais vues, puis les autres si le palier est trop petit
      var pool = shuffle(all.filter(function (q) { return !isSeen[q.id]; }), rng)
        .concat(shuffle(all.filter(function (q) { return isSeen[q.id]; }), rng));
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
      seen: seen,
      freeWrongStreak: 0,
      timeLeft: cfg.timerSeconds,
      budget: cfg.timerSeconds,
      spent: 0,
      jokers: { fifty: false, swap: false, pass: false },   // réservés au mode BAC
      hiddenWrong: [],
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
    markSeen(state, state.current);        // mémorisé pour les parties suivantes
    state.index++;
    state.freeWrongStreak = 0;
    if (state.index >= state.queue.length) {
      state.finished = true; state.won = true; state.current = null;
      return 'gameWon';
    }
    state.current = state.queue[state.index];
    state.options = makeOptions(state, state.current);
    state.timeLeft = state.config.timerSeconds;
    state.budget = state.config.timerSeconds;
    state.hiddenWrong = [];
    return 'nextQuestion';
  }

  // ---------------------------------------------------------------- actions du joueur

  function answerFree(state, input) {
    if (state.finished) return { ok: false, reason: 'finished' };
    if (mustUseMC(state)) return { ok: false, reason: 'mcForced' };
    var q = state.current;
    var prime = speedBonus(state);          // mesuré avant que le chrono ne soit réarmé
    tickSpent(state);
    var correct = checkFree(q, input);
    var res = { mode: 'free', correct: correct, question: q, given: input, points: 0, lost: 0, speed: 0 };

    if (state.mode === 'detente') {
      if (correct) {
        award(state, state.config.pointsFree + prime);
        res.points = state.config.pointsFree + prime;
        res.speed = prime;
        state.correctCount++;
      }
      res.event = relaxNext(state);
      state.log.push(res);
      return res;
    }

    if (correct) {
      award(state, state.config.pointsFree + prime);
      res.points = state.config.pointsFree + prime;
      res.speed = prime;
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
    tickSpent(state);
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

  /** Chaque pause coûte du temps de jeu : sans cela, on pourrait chercher la réponse ailleurs
   *  et rester devant un joueur honnête au classement, puisque le chrono est arrêté. */
  function penalizePause(state) {
    if (!state || state.finished) return { ok: false };
    var cost = state.config.pausePenaltySeconds;
    state.spent = Math.round((state.spent || 0) + cost);
    state.pauses = (state.pauses || 0) + 1;
    return { ok: true, cost: cost, pauses: state.pauses, spent: state.spent };
  }

  // ---------------------------------------------------------------- jokers

  /** Les jokers s'ouvrent à partir de la 6ème, en mode BAC uniquement. */
  function jokersAvailable(state) {
    return state.mode === 'bac' && state.levelIndex >= state.config.jokersFromLevel;
  }

  /** Un joker est-il utilisable ici et maintenant ? */
  function canUseJoker(state, kind) {
    if (state.finished || !state.current) return false;
    if (!jokersAvailable(state)) return false;
    if (!state.jokers || !state.jokers[kind]) return false;          // déjà utilisé
    if (kind === 'fifty' && state.hiddenWrong.length) return false;  // rien à révéler deux fois
    return state.score >= state.config.jokerCost;
  }

  /**
   * Trois aides, 6 points chacune, une seule fois par partie :
   *   - « fifty » (40/60) : barre trois mauvaises réponses du choix multiple ;
   *   - « swap »          : remplace la question par une autre de la même matière ;
   *   - « pass »          : passe la question, sans point et sans pénalité.
   */
  function useJoker(state, kind) {
    if (!canUseJoker(state, kind)) {
      return { ok: false, reason: !jokersAvailable(state) ? 'tooEarly'
        : (state.jokers && !state.jokers[kind] ? 'used' : 'noPoints') };
    }
    penalize(state, state.config.jokerCost);
    state.jokers[kind] = false;
    state.classErrors++;              // toute aide utilisée annule le bonus de classe sans faute
    var res = { ok: true, kind: kind, cost: state.config.jokerCost, score: state.score };

    if (kind === 'fifty') {
      var wrong = state.options.filter(function (o) {
        return normalize(o) !== normalize(state.current.answer);
      });
      state.hiddenWrong = shuffle(wrong, state.rng).slice(0, state.config.jokerHideCount);
      res.hidden = state.hiddenWrong.slice();
      res.event = 'reveal';
    } else if (kind === 'swap') {
      markSeen(state, state.current);
      nextQuestion(state);
      res.event = 'replaced';
    } else {
      res.event = advance(state);
      res.bonus = state.bonus;
    }
    state.log.push({ mode: 'joker', kind: kind, correct: false, points: 0, lost: res.cost });
    return res;
  }

  /** Le timer arrive à zéro. */
  function timeout(state) {
    if (state.finished) return { ok: false, reason: 'finished' };
    var q = state.current;
    tickSpent(state);
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
        spent: state.spent || 0,
        pauses: state.pauses || 0,
        pausePenalty: state.config.pausePenaltySeconds,
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
      spent: state.spent || 0,
      pauses: state.pauses || 0,
      pausePenalty: state.config.pausePenaltySeconds,
      jokers: state.jokers,
      jokersOpen: jokersAvailable(state),
      jokerCost: state.config.jokerCost,
      hiddenWrong: state.hiddenWrong || [],
      mcForced: mustUseMC(state)
    };
  }

  /** Photographie d'une partie, sérialisable en JSON : de quoi reprendre plus tard. */
  function serialize(state) {
    return {
      v: 1,
      mode: state.mode,
      levelIndex: state.levelIndex || 0,
      subjectIndex: state.subjectIndex || 0,
      qIndex: state.qIndex || 0,
      score: state.score,
      pointsSinceCheckpoint: state.pointsSinceCheckpoint || 0,
      lives: state.lives,
      classErrors: state.classErrors || 0,
      levelPoints: (state.levelPoints || []).slice(),
      seen: (state.seen || []).slice(),
      freeWrongStreak: state.freeWrongStreak || 0,
      spent: state.spent || 0,
      pauses: state.pauses || 0,
      jokers: state.jokers ? Object.assign({}, state.jokers) : null,
      timeLeft: Math.round(state.timeLeft),
      currentId: state.current ? state.current.id : null,
      queueIds: state.queue ? state.queue.map(function (q) { return q.id; }) : null,
      index: state.index || 0,
      correctCount: state.correctCount || 0,
      answered: (state.answeredBefore || 0) + state.log.length,
      level: state.levels ? state.levels[state.levelIndex] : null,
      date: Date.now()
    };
  }

  /** Reconstruit une partie à partir d'une photographie. */
  function restore(data, banks, options) {
    if (!data || !data.mode) return null;
    var bank = data.mode === 'detente' ? banks.detente : banks.bac;
    if (!bank) return null;
    var byId = {};
    bank.questions.forEach(function (q) { byId[q.id] = q; });

    var state = data.mode === 'detente'
      ? createRelax(bank, options)
      : createGame(bank, options);

    if (data.mode === 'detente') {
      var queue = (data.queueIds || []).map(function (id) { return byId[id]; }).filter(Boolean);
      if (queue.length) state.queue = queue;
      state.index = Math.min(data.index || 0, state.queue.length - 1);
      state.correctCount = data.correctCount || 0;
      state.current = state.queue[state.index];
    } else {
      state.levelIndex = data.levelIndex || 0;
      state.subjectIndex = data.subjectIndex || 0;
      state.qIndex = data.qIndex || 0;
      state.lives = data.lives || state.config.lives;
      state.classErrors = data.classErrors || 0;
      state.levelPoints = (data.levelPoints || []).slice();
      state.pointsSinceCheckpoint = data.pointsSinceCheckpoint || 0;
      state.current = byId[data.currentId] || null;
      if (!state.current) nextQuestion(state);          // question disparue : on en tire une autre
    }

    state.score = data.score || 0;
    state.spent = data.spent || 0;
    state.pauses = data.pauses || 0;
    if (data.jokers) state.jokers = Object.assign({}, data.jokers);
    state.seen = (data.seen || []).slice();
    state.freeWrongStreak = data.freeWrongStreak || 0;
    state.answeredBefore = data.answered || 0;
    // le chrono reprend là où il s'était arrêté : mettre la partie de côté ne rend pas du temps.
    // Un plancher de quelques secondes laisse le temps de relire la question, et ce supplément
    // est ajouté au budget pour qu'il ne soit pas compté comme du temps de réflexion.
    var saved = typeof data.timeLeft === 'number' ? data.timeLeft : state.config.timerSeconds;
    saved = Math.max(0, Math.min(saved, state.config.timerSeconds));
    var granted = Math.max(saved, Math.min(state.config.resumeMinSeconds, state.config.timerSeconds));
    state.timeLeft = granted;
    state.budget = granted;
    state.hiddenWrong = [];
    if (state.current) state.options = makeOptions(state, state.current);
    state.finished = false;
    state.won = false;
    return state;
  }

  /** Score maximum théorique d'une partie parfaite (bonus compris). */
  function maxScore(bank) {
    var pools = {};
    bank.questions.forEach(function (q) { pools[q.level + '|' + q.subject] = 1; });
    var total = 0;
    bank.levels.forEach(function (lv, i) {
      var n = bank.subjects.filter(function (s) { return pools[lv + '|' + s]; }).length;
      total += n * CONFIG.pointsFree;
      // à partir du CM1, chaque réponse libre rapide vaut un point de plus
      if (i >= CONFIG.speedBonusFromLevel) total += n * CONFIG.speedBonusPoints;
      if (i < CONFIG.bonusLifeFromLevel) total += CONFIG.perfectBonusPoints;
      // au lycée, la classe parfaite rapporte des points ; avant, un cœur, qui ne se compte pas ici
      else if (i >= CONFIG.lyceeFromLevel) total += CONFIG.lyceePerfectPoints;
    });
    return total;
  }

  return {
    CONFIG: CONFIG,
    normalize: normalize,
    normalizeStrict: normalizeStrict,
    levenshtein: levenshtein,
    speedBonus: speedBonus,
    speedOpen: speedOpen,
    toRational: toRational,
    sameValue: sameValue,
    toNumber: toNumber,
    checkFree: checkFree,
    createGame: createGame,
    createRelax: createRelax,
    nextQuestion: nextQuestion,
    answerFree: answerFree,
    answerMC: answerMC,
    penalizePause: penalizePause,
    useJoker: useJoker,
    canUseJoker: canUseJoker,
    timeout: timeout,
    mustUseMC: mustUseMC,
    progress: progress,
    serialize: serialize,
    restore: restore,
    maxScore: maxScore,
    mulberry32: mulberry32
  };
});
