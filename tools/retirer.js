/* Retire des questions du mode détente par identifiant.
 *   node tools/retirer.js det-gas-093 det-gas-097 …
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var file = path.join(root, 'data', 'detente.json');
var bank = JSON.parse(fs.readFileSync(file, 'utf8'));
var ids = process.argv.slice(2);
if (!ids.length) { console.error('usage : node tools/retirer.js <id> [id…]'); process.exit(1); }
var before = bank.questions.length;
var absent = ids.filter(function (id) { return !bank.questions.some(function (q) { return q.id === id; }); });
if (absent.length) { console.error('identifiants inconnus : ' + absent.join(', ')); process.exit(1); }
bank.questions = bank.questions.filter(function (q) { return ids.indexOf(q.id) === -1; });
fs.writeFileSync(file, JSON.stringify(bank, null, 2)
  .replace(/\{\n\s+"id"/g, '{"id"')
  .replace(/\n\s+"(theme|difficulty|prompt|answer|accepted|distractors|numeric|strict)"/g, ' "$1"')
  .replace(/\n\s+\}/g, '}') + '\n', 'utf8');
console.log((before - bank.questions.length) + ' question(s) retirée(s). Banque : ' + bank.questions.length + '.');
