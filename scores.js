/* Quiz Culture — pseudo, meilleurs scores et classement.
 *
 * Fonctionne toujours en local. Si data/leaderboard.json contient une URL Supabase et sa clé
 * publique, les scores sont aussi envoyés en ligne et le classement mondial est lisible.
 * Aucune donnée personnelle : un pseudo choisi par le joueur, un score, une date.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scores = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var K_PSEUDO = 'quizculture.pseudo';
  var K_TAG = 'quizculture.tag';         // numéro de l'appareil (joueur sans pseudo)
  var K_TAGS = 'quizculture.tags';       // pseudo → numéro : chacun garde le sien sur l'appareil
  var K_LOCAL = 'quizculture.scores';
  var K_QUEUE = 'quizculture.queue';
  var K_BEST = 'quizculture.best';       // meilleur score par mode
  var K_SLOT = 'quizculture.save';       // partie en cours, pour reprendre plus tard
  var K_LEVEL = 'quizculture.lastLevel'; // dernière classe atteinte, pour filtrer le classement
  var K_ERR = 'quizculture.lastError';   // dernier refus du serveur, affiché dans le classement

  function conf() {
    var c = (typeof window !== 'undefined' && window.LEADERBOARD) || {};
    return (c.url && c.anonKey) ? c : null;
  }
  function online() { return !!conf() && (typeof navigator === 'undefined' || navigator.onLine !== false); }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage plein ou privé */ }
  }

  // ------------------------------------------------------------------ pseudo
  /** Nettoie un pseudo : lettres, chiffres, espaces et tirets, 3 à 14 caractères. */
  function cleanPseudo(p) {
    return String(p || '')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 14);
  }
  /* ---- filtre des pseudos grossiers -------------------------------------
   * Deux listes, parce qu'un simple « contient » produit des refus absurdes :
   * « connaissance » contient « con », « unique » contient « nique », « fichier »
   * contient « chier ». Les termes ambigus ne sont donc refusés que s'ils forment
   * un mot entier ; les autres, assez longs pour être sans équivoque, sont
   * cherchés n'importe où.
   * Les listes s'écrivent en forme réduite : sans accent, sans lettre doublée. */
  var GROS_PARTOUT = ['conard', 'conasse', 'encule', 'enculer', 'enfoire', 'salope', 'salopard',
    'putain', 'batard', 'tarlouze', 'tafiole', 'bougnoule', 'youpin', 'negrese',
    'pedophil', 'zoophil', 'pornograf', 'sodomi', 'violeur', 'ntm', 'fdp'];
  var GROS_MOTS = ['con', 'cons', 'cul', 'culs', 'pd', 'pede', 'pedes', 'pute', 'putes',
    'bite', 'bites', 'zob', 'couile', 'couiles', 'nichon', 'nichons', 'sexe', 'penis', 'vagin',
    'chate', 'salaud', 'salauds', 'merde', 'merdes', 'chier', 'nique', 'niquer', 'niquez',
    'caca', 'pipi', 'nazi', 'nazis', 'hitler', 'negre', 'negres', 'viol', 'pise', 'anus',
    'sperme', 'suce', 'sucer', 'baise', 'baiser', 'foutre', 'salop'];

  /** Forme réduite : sans accent, sans habillage, sans lettre doublée.
   *  Neutralise « S4l0pe », « saaalope » et « s.a.l.o.p.e ». */
  function reduit(s) {
    var t = String(s || '').toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t
      .replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a')
      .replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b')
      .replace(/[^a-z]/g, '')
      .replace(/(.)\1+/g, '$1');
  }

  /** null si le pseudo est acceptable, sinon la raison du refus. */
  function pseudoRefus(p) {
    var c = cleanPseudo(p);
    if (c.length < 3) return 'Au moins 3 caractères.';
    var mots = c.split(/[\s_-]+/).map(reduit).filter(Boolean);
    var tout = mots.join('');
    var i;
    for (i = 0; i < GROS_PARTOUT.length; i++) {
      if (tout.indexOf(GROS_PARTOUT[i]) !== -1) return 'Ce pseudo n\'est pas accepté.';
    }
    for (i = 0; i < mots.length; i++) {
      if (GROS_MOTS.indexOf(mots[i]) !== -1) return 'Ce pseudo n\'est pas accepté.';
    }
    return null;
  }

  function pseudoValid(p) { return !pseudoRefus(p); }
  function getPseudo() { try { return localStorage.getItem(K_PSEUDO) || ''; } catch (e) { return ''; } }

  /** Numéro à 5 chiffres, tiré au hasard. */
  function randomTag() {
    var n;
    try {
      var buf = new Uint32Array(1);
      (self.crypto || window.crypto).getRandomValues(buf);
      n = buf[0] % 100000;
    } catch (e) { n = Math.floor(Math.random() * 100000); }
    return ('0000' + n).slice(-5);
  }

  function readDeviceTag() {
    try { var t = localStorage.getItem(K_TAG); return (t && /^\d{5,6}$/.test(t)) ? t : null; }
    catch (e) { return null; }
  }
  /** Numéro de l'appareil : sert au joueur qui n'a pas choisi de pseudo. */
  function deviceTag() {
    var t = readDeviceTag();
    if (t) return t;
    t = randomTag();
    try { localStorage.setItem(K_TAG, t); } catch (e) { /* ignore */ }
    return t;
  }

  function tagKey(p) { return cleanPseudo(p).toLowerCase(); }
  function tagsMap() { return read(K_TAGS, {}) || {}; }
  /** Les anciennes versions stockaient « clé → numéro » ; on lit les deux formes. */
  function entryOf(v) { return (typeof v === 'string') ? { tag: v, name: null, at: 0 } : (v || {}); }
  function tagOf(v) { return entryOf(v).tag; }

  /** Numéro de joueur : « Benji #04217 ».
   *  Il est attaché au pseudo, pas à l'appareil : si Benji et Dédé jouent tour à tour sur le
   *  même téléphone, chacun garde son numéro, et Benji retrouve le sien en revenant. */
  function getTag(pseudo) {
    var key = tagKey(pseudo === undefined || pseudo === null ? getPseudo() : pseudo);
    if (!key) return deviceTag();                  // pas de pseudo : numéro de l'appareil
    var map = tagsMap();
    var known = tagOf(map[key]);
    if (known && /^\d{5,6}$/.test(known)) return known;

    var used = Object.keys(map).map(function (k) { return tagOf(map[k]); });
    var t = null;
    // premier pseudo de cet appareil : il hérite du numéro déjà affiché, pour ne pas changer d'identité
    if (!used.length) t = readDeviceTag();
    while (!t || used.indexOf(t) !== -1) t = randomTag();
    map[key] = { tag: t, name: cleanPseudo(pseudo === undefined || pseudo === null ? getPseudo() : pseudo), at: Date.now() };
    write(K_TAGS, map);
    return t;
  }

  /** Numéro masqué pour l'affichage public : « 482913 » → « 48***3 ».
   *  Le numéro sert aussi de preuve pour récupérer son compte : il ne doit pas se lire
   *  en entier dans le classement. Le joueur voit le sien en clair dans la fenêtre du pseudo. */
  function maskTag(t) {
    t = String(t || '');
    if (t.length < 4) return t;
    return t.slice(0, 2) + new Array(t.length - 2).join('*') + t.slice(-1);
  }


  // ------------------------------------------------------------------ défis (mode détente)
  /* Un défi oppose deux joueurs sur la même liste de questions. C'est la graine du tirage
   * aléatoire qui garantit cette égalité : à graine identique, le moteur compose la même
   * file. L'historique des questions vues doit donc être ignoré pendant un défi, sinon les
   * deux files divergeraient — chacun n'ayant pas vu les mêmes questions. */
  function defiGraine() {
    try {
      var buf = new Uint32Array(1);
      (self.crypto || window.crypto).getRandomValues(buf);
      return buf[0] % 2147483647;
    } catch (e) { return Math.floor(Math.random() * 2147483647); }
  }

  /** Qui l'emporte ? Le score, puis le temps à score égal — comme au classement. */
  function defiGagne(monScore, mesSecondes, sonScore, sesSecondes) {
    if (monScore !== sonScore) return monScore > sonScore;
    return (mesSecondes || 0) < (sesSecondes || 0);
  }

  /** Dépose un défi : ma partie est déjà jouée, mon score part avec. */
  function defiLancer(toPseudo, toMasque, score, seconds, seed, abandon) {
    return rpc('defi_lancer', {
      p_from_tag: getTag(), p_from_pseudo: getPseudo() || 'Anonyme',
      p_to_pseudo: toPseudo, p_to_masque: toMasque,
      p_score: Math.round(score || 0), p_seconds: Math.round(seconds || 0),
      p_seed: seed, p_abandon: !!abandon
    });
  }

  /** Ce qui m'attend : défis reçus et résultats non consultés. */
  function defiBoite() {
    return rpc('defi_boite', { p_tag: getTag() }).then(function (rows) { return rows || []; });
  }

  function defiRepondre(id, accepte, score, seconds, abandon) {
    return rpc('defi_repondre', {
      p_id: id, p_tag: getTag(), p_accepte: !!accepte,
      p_score: score === undefined || score === null ? null : Math.round(score),
      p_seconds: seconds === undefined || seconds === null ? null : Math.round(seconds),
      p_abandon: !!abandon
    });
  }

  function defiVu(id) { return rpc('defi_vu', { p_id: id, p_tag: getTag() }); }

  /** Tous mes défis tranchés, du plus récent au plus ancien. */
  function defiHistorique(max) {
    return rpc('defi_historique', { p_tag: getTag(), p_max: max || 60 })
      .then(function (rows) { return rows || []; });
  }

  /** Cherche un adversaire par début de pseudo. Le serveur ne renvoie que le numéro masqué. */
  function defiChercher(debut, max) {
    if (!debut || debut.length < 2) return Promise.resolve([]);
    return rpc('defi_chercher', { p_debut: debut, p_max: max || 20 })
      .then(function (rows) { return rows || []; });
  }

  function defiBilan() {
    return rpc('defi_bilan', { p_tag: getTag() }).then(function (r) {
      var b = (r && r[0]) || r || {};
      return { gagnes: b.gagnes || 0, perdus: b.perdus || 0,
               refuses: b.refuses || 0, attente: b.attente || 0 };
    });
  }

  /** Appel d'une fonction Supabase (RPC). Renvoie le message du serveur en cas de refus. */
  function rpc(name, args) {
    var c = conf();
    if (!c) return Promise.reject(new Error('classement local'));
    return fetch(c.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      cache: 'no-store',
      headers: heads(c, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (!r.ok) throw new Error((data && data.message) || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  /** Fait officialiser le numéro par le serveur : il devient unique pour tout le monde.
   *  Le numéro déjà utilisé sur l'appareil est proposé en premier, pour ne pas changer
   *  d'identité en route. Hors ligne, on garde le numéro local et on réessaiera. */
  function registerTag(pseudo) {
    var name = cleanPseudo(pseudo || getPseudo());
    var key = tagKey(name);
    if (!key) return Promise.resolve(null);
    var cur = entryOf(tagsMap()[key]);
    if (!conf() || !online() || cur.ok) return Promise.resolve(cur.tag || getTag(name));
    var wanted = cur.tag || getTag(name);
    return rpc('claim_pseudo', { p_pseudo: name, p_wanted: wanted }).then(function (tag) {
      if (!tag) return wanted;
      var map = tagsMap(), e = entryOf(map[key]);
      map[key] = { tag: String(tag), name: name, at: e.at || Date.now(), ok: true };
      write(K_TAGS, map);
      return String(tag);
    }, function () { return wanted; });      // serveur injoignable : le numéro local fait l'affaire
  }

  /** Récupération d'un compte sur un autre appareil : pseudo + numéro complet.
   *  Le serveur limite les essais, pour qu'on ne devine pas les chiffres masqués. */
  function recoverAccount(pseudo, tag) {
    var name = cleanPseudo(pseudo), num = String(tag || '').replace(/\D/g, '');
    if (!pseudoValid(name)) return Promise.reject(new Error('Pseudo trop court.'));
    if (!/^[0-9]{5,6}$/.test(num)) return Promise.reject(new Error('Numéro à 5 ou 6 chiffres.'));
    return rpc('recover_player', { p_pseudo: name, p_tag: num }).then(function (found) {
      if (found !== true) throw new Error('Ce pseudo et ce numéro ne vont pas ensemble.');
      try { localStorage.setItem(K_PSEUDO, name); } catch (e) { /* ignore */ }
      var map = tagsMap();
      map[tagKey(name)] = { tag: num, name: name, at: Date.now(), ok: true };
      write(K_TAGS, map);
      return { pseudo: name, tag: num };
    });
  }

  /** Nom affiché : pseudo + numéro. */
  function displayName(pseudo, tag) {
    var p = pseudo || getPseudo() || 'Anonyme';
    return p + ' #' + (tag || getTag());
  }
  function setPseudo(p) {
    var c = cleanPseudo(p);
    if (!pseudoValid(c)) return null;
    try { localStorage.setItem(K_PSEUDO, c); } catch (e) { /* ignore */ }
    getTag(c);                    // réserve (ou retrouve) son numéro tout de suite
    var map = tagsMap(), key = tagKey(c), e2 = entryOf(map[key]);
    map[key] = { tag: e2.tag, name: c, at: Date.now() };   // orthographe et date de dernier usage
    write(K_TAGS, map);
    return c;
  }

  /** Les comptes déjà utilisés sur cet appareil, du plus récent au plus ancien.
   *  Sert de filet : personne ne perd son numéro parce qu'un autre joueur est passé après lui. */
  function accounts() {
    var map = tagsMap();
    return Object.keys(map).map(function (k) {
      var e = entryOf(map[k]);
      return { pseudo: e.name || k, tag: e.tag, at: e.at || 0 };
    }).filter(function (a) { return a.tag; })
      .sort(function (a, b) { return b.at - a.at; });
  }

  /** Retire un compte de la liste locale. Le numéro reste attribué côté serveur : c'est bien
   *  le but, saisir de nouveau ce pseudo et ce numéro permet de le récupérer. */
  function forgetAccount(pseudo) {
    var key = tagKey(pseudo), map = tagsMap();
    if (!map[key]) return false;
    delete map[key];
    write(K_TAGS, map);
    if (tagKey(getPseudo()) === key) {        // c'était le joueur en cours : on le déconnecte
      try { localStorage.removeItem(K_PSEUDO); } catch (e) { /* ignore */ }
    }
    return true;
  }

  // ------------------------------------------------------------------ meilleur score
  function best(mode) { return (read(K_BEST, {}) || {})[mode || 'bac'] || 0; }
  function saveBest(mode, score) {
    var all = read(K_BEST, {});
    if (score > (all[mode] || 0)) { all[mode] = score; write(K_BEST, all); return true; }
    return false;
  }

  // ------------------------------------------------------------------ partie sauvegardée
  function saveSlot(data) { write(K_SLOT, data); }
  function loadSlot() { return read(K_SLOT, null); }
  function clearSlot() { try { localStorage.removeItem(K_SLOT); } catch (e) { /* ignore */ } }
  function hasSlot() { var d = loadSlot(); return !!(d && d.mode); }

  function lastLevel() { try { return localStorage.getItem(K_LEVEL) || ''; } catch (e) { return ''; } }
  function setLastLevel(lv) { try { if (lv) localStorage.setItem(K_LEVEL, lv); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------ scores locaux
  /** À score égal, le plus rapide passe devant. */
  function byScoreThenTime(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var ta = a.seconds || Infinity, tb = b.seconds || Infinity;
    return ta - tb;
  }
  function localScores(mode) {
    return read(K_LOCAL, []).filter(function (s) { return !mode || s.mode === mode; })
      .sort(byScoreThenTime);
  }
  function pushLocal(entry) {
    var all = read(K_LOCAL, []);
    all.push(entry);
    all.sort(byScoreThenTime);
    write(K_LOCAL, all.slice(0, 200));
  }

  // ------------------------------------------------------------------ diagnostic
  /** Mémorise le dernier refus du serveur : sans cela, un envoi raté est silencieux. */
  function noteError(msg) {
    try { localStorage.setItem(K_ERR, JSON.stringify({ msg: String(msg).slice(0, 220), at: Date.now() })); }
    catch (e) { /* ignore */ }
  }
  function clearError() { try { localStorage.removeItem(K_ERR); } catch (e) { /* ignore */ } }
  function lastError() { return read(K_ERR, null); }

  // ------------------------------------------------------------------ envoi en ligne
  /** En-têtes d'appel. La clé « anon » historique est un JWT (eyJ…) et sert aussi de jeton ;
   *  les nouvelles clés « publishable » (sb_publishable_…) n'en sont pas et ne doivent pas
   *  partir en Authorization, sous peine d'être rejetées comme jeton invalide. */
  function heads(c, extra) {
    var h = { 'apikey': c.anonKey };
    if (/^eyJ/.test(c.anonKey)) h['Authorization'] = 'Bearer ' + c.anonKey;
    for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  function post(entry) {
    var c = conf();
    if (!c) return Promise.reject(new Error('non configuré'));
    return fetch(c.url.replace(/\/$/, '') + '/rest/v1/scores', {
      method: 'POST',
      cache: 'no-store',
      headers: heads(c, { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        pseudo: entry.pseudo, tag: entry.tag, score: entry.score,
        mode: entry.mode, level: entry.level || null, seconds: entry.seconds || null
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          noteError('envoi refusé — HTTP ' + r.status + (t ? ' · ' + t.replace(/\s+/g, ' ') : ''));
          throw new Error('HTTP ' + r.status);
        }, function () {
          noteError('envoi refusé — HTTP ' + r.status);
          throw new Error('HTTP ' + r.status);
        });
      }
      clearError();
      return true;
    }, function (e) {
      noteError('envoi impossible — ' + (e && e.message ? e.message : 'réseau'));
      throw e;
    });
  }

  /** Renvoie les scores en attente (parties jouées hors ligne). */
  function queued() { return read(K_QUEUE, []); }

  function flush() {
    var q = queued();
    if (!q.length || !online()) return Promise.resolve(0);
    var rest = [], sent = 0;
    return q.reduce(function (chain, entry) {
      return chain.then(function () {
        return post(entry).then(function () { sent++; }, function () { rest.push(entry); });
      });
    }, Promise.resolve()).then(function () {
      write(K_QUEUE, rest);
      return sent;
    });
  }

  /** Enregistre un score : toujours en local, en ligne si possible, sinon mis en file. */
  function submit(entry) {
    var who = cleanPseudo(entry.pseudo) || 'Anonyme';
    entry = {
      pseudo: who,
      tag: entry.tag || getTag(who),
      score: Math.max(0, Math.round(entry.score || 0)),
      mode: entry.mode || 'bac',
      level: entry.level || null,
      seconds: Math.max(0, Math.round(entry.seconds || 0)) || null,
      date: new Date().toISOString()
    };
    pushLocal(entry);
    setLastLevel(entry.level);
    var record = saveBest(entry.mode, entry.score);
    if (!conf()) return Promise.resolve({ stored: 'local', record: record });
    return post(entry).then(function () {
      return { stored: 'online', record: record };
    }, function () {
      var q = queued(); q.push(entry); write(K_QUEUE, q);
      return { stored: 'queued', record: record };
    });
  }

  /** Classement : en ligne si configuré, sinon les parties locales. */
  function top(mode, limit) {
    limit = limit || 50;
    var c = conf();
    if (!c || !online()) {
      return Promise.resolve({ source: 'local', rows: localScores(mode).slice(0, limit) });
    }
    var url = c.url.replace(/\/$/, '') + '/rest/v1/scores?select=pseudo,tag,score,mode,level,seconds,created_at' +
      '&mode=eq.' + encodeURIComponent(mode || 'bac') +
      '&order=score.desc,seconds.asc.nullslast&limit=' + limit;
    return fetch(url, { headers: heads(c), cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            noteError('lecture refusée — HTTP ' + r.status + (t ? ' · ' + t.replace(/\s+/g, ' ') : ''));
            throw new Error('HTTP ' + r.status);
          });
        }
        return r.json();
      })
      .then(function (rows) { return { source: 'online', rows: rows }; })
      .catch(function () { return { source: 'local', rows: localScores(mode).slice(0, limit) }; });
  }

  /** Envoi de test : dépose une ligne « Test » et renvoie la réponse brute du serveur.
   *  Ne lève jamais : c'est un outil de diagnostic, pas un chemin de jeu. */
  function testInsert() {
    var c = conf();
    if (!c) return Promise.resolve('aucune configuration : classement local');
    var url = c.url.replace(/\/$/, '') + '/rest/v1/scores';
    var body = { pseudo: 'Test', tag: getTag(), score: 1, mode: 'detente', level: null, seconds: 1 };
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: heads(c, { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        return 'POST ' + r.status + ' ' + (r.statusText || '') + ' · ' +
          (t ? t.replace(/\s+/g, ' ').slice(0, 300) : '(réponse vide)');
      }, function () { return 'POST ' + r.status + ' (corps illisible)'; });
    }, function (e) {
      return 'POST impossible · ' + (e && e.message ? e.message : 'erreur réseau');
    });
  }

  /** Le stockage local est-il réellement utilisable ? (navigation privée, quota, réglages) */
  function storageOk() {
    try {
      localStorage.setItem('quizculture.test', '1');
      var ok = localStorage.getItem('quizculture.test') === '1';
      localStorage.removeItem('quizculture.test');
      return ok;
    } catch (e) { return false; }
  }

  /** État de santé, affiché en bas des règles : de quoi diagnostiquer sans brancher un câble. */
  function health() {
    var c = conf();
    return {
      configured: !!c,
      host: c ? c.url.replace(/^https?:\/\//, '').split('.')[0] : null,
      keyKind: c ? (/^eyJ/.test(c.anonKey) ? 'anon (JWT)' : (/^sb_/.test(c.anonKey) ? 'publishable' : 'inconnue')) : null,
      storage: storageOk(),
      local: localScores().length,
      best: best('bac') + ' / ' + best('detente'),
      queued: queued().length,
      lastError: (lastError() || {}).msg || null
    };
  }

  return {
    configured: function () { return !!conf(); },
    storageOk: storageOk,
    health: health,
    testInsert: testInsert,
    cleanPseudo: cleanPseudo,
    pseudoValid: pseudoValid,
    getPseudo: getPseudo,
    setPseudo: setPseudo,
    defiLancer: defiLancer,
    defiBoite: defiBoite,
    defiRepondre: defiRepondre,
    defiVu: defiVu,
    defiBilan: defiBilan,
    defiHistorique: defiHistorique,
    defiChercher: defiChercher,
    defiGraine: defiGraine,
    defiGagne: defiGagne,
    getTag: getTag,
    maskTag: maskTag,
    accounts: accounts,
    forgetAccount: forgetAccount,
    registerTag: registerTag,
    recoverAccount: recoverAccount,
    displayName: displayName,
    saveSlot: saveSlot,
    loadSlot: loadSlot,
    clearSlot: clearSlot,
    hasSlot: hasSlot,
    lastLevel: lastLevel,
    byScoreThenTime: byScoreThenTime,
    pseudoRefus: pseudoRefus,
    lastError: lastError,
    clearError: clearError,
    best: best,
    localScores: localScores,
    submit: submit,
    top: top,
    flush: flush,
    queued: queued
  };
});
