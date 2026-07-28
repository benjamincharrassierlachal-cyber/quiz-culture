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
  var K_TAG = 'quizculture.tag';         // numéro de joueur, pour distinguer les homonymes
  var K_LOCAL = 'quizculture.scores';
  var K_QUEUE = 'quizculture.queue';
  var K_BEST = 'quizculture.best';       // meilleur score par mode
  var K_SLOT = 'quizculture.save';       // partie en cours, pour reprendre plus tard
  var K_LEVEL = 'quizculture.lastLevel'; // dernière classe atteinte, pour filtrer le classement

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
  function pseudoValid(p) { return cleanPseudo(p).length >= 3; }
  function getPseudo() { try { return localStorage.getItem(K_PSEUDO) || ''; } catch (e) { return ''; } }

  /** Numéro de joueur à 5 chiffres, tiré une seule fois puis conservé : « Benji #04217 ».
   *  Deux joueurs peuvent choisir le même pseudo, le numéro les distingue au classement. */
  function getTag() {
    var t;
    try { t = localStorage.getItem(K_TAG); } catch (e) { t = null; }
    if (t && /^\d{5}$/.test(t)) return t;
    var n;
    try {
      var buf = new Uint32Array(1);
      (self.crypto || window.crypto).getRandomValues(buf);
      n = buf[0] % 100000;
    } catch (e) { n = Math.floor(Math.random() * 100000); }
    t = ('0000' + n).slice(-5);
    try { localStorage.setItem(K_TAG, t); } catch (e) { /* ignore */ }
    return t;
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
    return c;
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

  // ------------------------------------------------------------------ envoi en ligne
  function post(entry) {
    var c = conf();
    if (!c) return Promise.reject(new Error('non configuré'));
    return fetch(c.url.replace(/\/$/, '') + '/rest/v1/scores', {
      method: 'POST',
      headers: {
        'apikey': c.anonKey,
        'Authorization': 'Bearer ' + c.anonKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        pseudo: entry.pseudo, tag: entry.tag, score: entry.score,
        mode: entry.mode, level: entry.level || null, seconds: entry.seconds || null
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return true;
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
    entry = {
      pseudo: cleanPseudo(entry.pseudo) || 'Anonyme',
      tag: entry.tag || getTag(),
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
    return fetch(url, { headers: { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + c.anonKey } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { return { source: 'online', rows: rows }; })
      .catch(function () { return { source: 'local', rows: localScores(mode).slice(0, limit) }; });
  }

  return {
    configured: function () { return !!conf(); },
    cleanPseudo: cleanPseudo,
    pseudoValid: pseudoValid,
    getPseudo: getPseudo,
    setPseudo: setPseudo,
    getTag: getTag,
    displayName: displayName,
    saveSlot: saveSlot,
    loadSlot: loadSlot,
    clearSlot: clearSlot,
    hasSlot: hasSlot,
    lastLevel: lastLevel,
    byScoreThenTime: byScoreThenTime,
    best: best,
    localScores: localScores,
    submit: submit,
    top: top,
    flush: flush,
    queued: queued
  };
});
