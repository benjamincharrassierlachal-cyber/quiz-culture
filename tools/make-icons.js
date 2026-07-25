/* Génère l'icône de l'app à partir du sprite du héros défini dans template.html.
 * Produit web/icons/icon.svg, puis les PNG si ImageMagick (`convert`) est disponible.
 * Lancer : node tools/make-icons.js
 */
var fs = require('fs'), path = require('path'), cp = require('child_process');
var root = path.join(__dirname, '..');
var tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');

// on récupère la palette et les images du sprite, pour ne pas les dupliquer
var code = tpl.slice(tpl.indexOf('var PAL = {'), tpl.indexOf('var SPRITE_W'));
var api = new Function(code + '\nreturn {PAL: PAL, FRAMES: FRAMES};')();
var rows = api.FRAMES[0], PAL = api.PAL;

var px = 26, w = rows[0].length * px, h = rows.length * px;
var body = '';
for (var y = 0; y < rows.length; y++) {
  for (var x = 0; x < rows[y].length; x++) {
    var c = rows[y][x]; if (c === '.' || !PAL[c]) continue;
    body += '<rect x="' + (x * px) + '" y="' + (y * px) + '" width="' + px + '" height="' + px + '" fill="' + PAL[c] + '"/>';
  }
}

var S = 512, ox = (S - w) / 2, oy = (S - h) / 2 + 10;
var svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '">' +
  '<rect width="' + S + '" height="' + S + '" rx="96" fill="#2f6bff"/>' +
  '<circle cx="256" cy="300" r="176" fill="#4b82ff"/>' +
  '<circle cx="96" cy="118" r="34" fill="#1b1526"/><circle cx="96" cy="118" r="27" fill="#ffc531"/><circle cx="96" cy="118" r="13" fill="#e09b12"/>' +
  '<circle cx="416" cy="118" r="34" fill="#1b1526"/><circle cx="416" cy="118" r="27" fill="#ffc531"/><circle cx="416" cy="118" r="13" fill="#e09b12"/>' +
  '<ellipse cx="256" cy="' + (oy + h + 14) + '" rx="96" ry="20" fill="rgba(27,21,38,.25)"/>' +
  '<g transform="translate(' + ox + ',' + oy + ')">' + body + '</g>' +
  '</svg>';

var dir = path.join(root, 'web', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.svg'), svg);

var sizes = { 'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'favicon-64.png': 64 };
var ok = true;
Object.keys(sizes).forEach(function (name) {
  try {
    cp.execFileSync('convert', ['-background', 'none', '-resize', sizes[name] + 'x' + sizes[name],
      path.join(dir, 'icon.svg'), path.join(dir, name)]);
  } catch (e) { ok = false; }
});
console.log(ok ? 'Icônes générées dans web/icons/' :
  'icon.svg généré. PNG non produits (ImageMagick absent) — les PNG existants sont conservés.');
