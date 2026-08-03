# -*- coding: utf-8 -*-
"""Compose la bannière 1024x500 du Play Store à partir du personnage de l'icône.

    python3 tools/banniere.py   ->   store/banniere-1024x500.png
"""
import re
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1024, 500
CIEL_HAUT, CIEL_BAS = (47, 107, 255), (140, 182, 255)
VERT, VERT_SOMBRE = (94, 194, 106), (72, 168, 87)
NUIT, JAUNE = (27, 21, 38), (255, 212, 0)
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def personnage(hauteur, lisse=14):
    """Redessine le personnage du SVG de l'icône, sur fond transparent.

    `lisse` arrondit les marches d'escalier du pixel art : chaque couleur est
    isolée, floutée puis re-seuillée, ce qui rabote les angles sans déformer la
    silhouette. 0 conserve les blocs nets, au-delà de 18 les membres fusionnent.
    """
    svg = open('web/icons/icon.svg').read()
    m = re.search(r'<g transform="translate\((\d+),(\d+)\)">(.*?)</g>', svg, re.S)
    rects = re.findall(r'<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"', m.group(3))
    bw, bh, k = 312, 416, 4          # dessiné en grand puis réduit : bords nets
    ordre = []
    for *_, c in rects:
        if c not in ordre:
            ordre.append(c)          # l'ordre du SVG fait la superposition
    base = Image.new('RGBA', (bw * k, bh * k), (0, 0, 0, 0))
    for c in ordre:
        masque = Image.new('L', base.size, 0)
        d = ImageDraw.Draw(masque)
        for x, y, w, h, cc in rects:
            if cc != c:
                continue
            x, y, w, h = int(x) * k, int(y) * k, int(w) * k, int(h) * k
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
        if lisse:
            masque = masque.filter(ImageFilter.GaussianBlur(lisse))
            masque = masque.point(lambda v: 255 if v > 128 else 0)
            masque = masque.filter(ImageFilter.GaussianBlur(1.6))
        couche = Image.new('RGBA', base.size, c)
        couche.putalpha(masque)
        base = Image.alpha_composite(base, couche)
    e = hauteur / bh
    return base.resize((int(bw * e), int(bh * e)), Image.LANCZOS)


def ajuste(s, largeur, taille_max, ep=0):
    """Plus grande taille de police tenant dans la largeur, contour compris."""
    for t in range(taille_max, 8, -1):
        p = ImageFont.truetype(F, t)
        b = p.getbbox(s, stroke_width=ep)
        if b[2] - b[0] <= largeur:
            return p
    return ImageFont.truetype(F, 8)


def texte(d, xy, s, police, fill, contour=None, ep=0, ancre='la'):
    if contour and ep:
        d.text(xy, s, font=police, fill=contour, anchor=ancre, stroke_width=ep, stroke_fill=contour)
    d.text(xy, s, font=police, fill=fill, anchor=ancre)


def nuage(d, cx, cy, e):
    for dx, dy, r in [(-58, 8, 34), (-20, -14, 46), (26, -4, 38), (60, 12, 28), (0, 18, 40)]:
        x, y, rr = cx + dx * e, cy + dy * e, r * e
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 255, 255))


# --- ciel ---
im = Image.new('RGB', (W, H))
d = ImageDraw.Draw(im)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(CIEL_HAUT[i] + (CIEL_BAS[i] - CIEL_HAUT[i]) * t) for i in range(3)))

nuage(d, 262, 54, 0.6)
nuage(d, 566, 48, 0.68)
nuage(d, 892, 92, 0.82)

# --- colline ---
d.ellipse([-260, 372, W + 260, 792], fill=VERT_SOMBRE)
d.ellipse([-260, 386, W + 260, 806], fill=VERT)

# --- personnage ---
im = im.convert('RGBA')
ombre = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(ombre).ellipse([64, 432, 268, 476], fill=(27, 21, 38, 70))
im = Image.alpha_composite(im, ombre)
im.alpha_composite(personnage(330), (68, 112))
d = ImageDraw.Draw(im)

# --- textes ---
MARGE, X = 52, 368
LARG = W - X - MARGE
TITRE, SOUS = 'DU CP AU BAC', 'QUIZZ DE CULTURE GÉNÉRALE'
ETIQ = '2 600 QUESTIONS  ·  SANS PUB  ·  HORS LIGNE'

gros = ajuste(TITRE, LARG, 96, ep=9)
moyen = ajuste(SOUS, LARG, 46, ep=6)
petit = ajuste(ETIQ, LARG - 44, 27)

y = 128
texte(d, (X, y), TITRE, gros, (255, 255, 255), NUIT, 9)
y += gros.getbbox(TITRE, stroke_width=9)[3] + 16
texte(d, (X, y), SOUS, moyen, JAUNE, NUIT, 6)
y += moyen.getbbox(SOUS, stroke_width=6)[3] + 24

b = d.textbbox((0, 0), ETIQ, font=petit)
pw, ph = b[2] - b[0] + 44, b[3] - b[1] + 26
d.rounded_rectangle([X, y, X + pw, y + ph], radius=ph // 2, fill=NUIT)
texte(d, (X + pw // 2, y + ph // 2 + 1), ETIQ, petit, (255, 255, 255), ancre='mm')

im.convert('RGB').save('store/banniere-1024x500.png', optimize=True)
print('titre %d px · sous-titre %d px · étiquette %d px · bas du bloc %d' % (gros.size, moyen.size, petit.size, y + ph))
