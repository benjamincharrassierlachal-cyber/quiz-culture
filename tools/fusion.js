/* Fusionne deux banques BAC sans créer de doublon.
 *
 *   node tools/fusion.js ancienne.json nouvelle.json sortie.json
 *
 * Exclusions appliquées à la seconde banque :
 *   - énoncé déjà présent dans la première ;
 *   - réponse déjà utilisée dans le même couple classe/matière — sinon un joueur pourrait
 *     devoir donner deux fois la même réponse au cours d'une même classe.
 *
 * La comparaison utilise la normalisation du moteur, celle-là même qui juge les réponses en
 * partie : « la carte » et « carte » sont donc bien vus comme un doublon. Une première version
 * avec une normalisation maison laissait passer 26 collisions.
 *
 * Les identifiants de la seconde banque sont renumérotés à la suite de ceux de la première,
 * pour ne pas invalider l'historique « questions déjà vues » conservé sur les appareils.
 */
var fs = require('fs'), path = require('path');
var E = require(path.join(__dirname, '..', 'engine.js'));

var a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
var b = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

function cleAnswer(q) { return (q.strict ? E.normalizeStrict : E.normalize)(q.answer); }
function clePrompt(q) { return E.normalize(q.prompt); }
function pool(q) { return q.level + '|' + q.subject; }

var enonces = {}, reponses = {}, compte = {}, prefixe = {};
a.questions.forEach(function (q) {
  var p = pool(q);
  enonces[clePrompt(q)] = 1;
  (reponses[p] = reponses[p] || {})[cleAnswer(q)] = 1;
  compte[p] = (compte[p] || 0) + 1;
  var m = /^(.*)-(\d+)$/.exec(q.id);
  if (m) prefixe[p] = m[1];
});

var gardees = [], ecart = { enonce: 0, reponse: 0 };
b.questions.forEach(function (q) {
  var p = pool(q);
  if (enonces[clePrompt(q)]) { ecart.enonce++; return; }
  reponses[p] = reponses[p] || {};
  if (reponses[p][cleAnswer(q)]) { ecart.reponse++; return; }
  enonces[clePrompt(q)] = 1;
  reponses[p][cleAnswer(q)] = 1;
  compte[p] = (compte[p] || 0) + 1;
  var copie = JSON.parse(JSON.stringify(q));
  copie.id = (prefixe[p] || p) + '-' + ('00' + compte[p]).slice(-3);
  gardees.push(copie);
});

a.questions = a.questions.concat(gardees);
fs.writeFileSync(process.argv[4], JSON.stringify(a, null, 2) + '\n');
console.log('conservées : ' + (a.questions.length - gardees.length) + ' + ' + gardees.length +
  ' = ' + a.questions.length + ' questions');
console.log('  écartées — énoncé déjà présent : ' + ecart.enonce);
console.log('  écartées — réponse déjà utilisée dans le pool : ' + ecart.reponse);
