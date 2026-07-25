/* Petit serveur local pour tester web/ depuis le téléphone (même Wi-Fi que l'ordinateur).
 * Lancer : node tools/serve.js   →   puis ouvrir l'adresse affichée sur le téléphone.
 * Note : en http://, l'installation « écran d'accueil » et le micro restent désactivés.
 */
var http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
var root = path.join(__dirname, '..', 'web'), port = process.env.PORT || 8080;

var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  var file = path.join(root, path.normalize(rel).replace(/^([\\/])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('interdit'); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, '0.0.0.0', function () {
  var ips = [];
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    ifaces[name].forEach(function (i) { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); });
  });
  console.log('Quiz Culture servi depuis web/ :');
  console.log('  sur cet ordinateur : http://localhost:' + port);
  ips.forEach(function (ip) { console.log('  depuis le téléphone : http://' + ip + ':' + port); });
  console.log('Ctrl+C pour arrêter.');
});
