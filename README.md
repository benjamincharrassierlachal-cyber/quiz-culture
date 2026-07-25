# Quiz Culture — prototype complet

```
quiz-culture/
├── prototype.html                 ← à ouvrir en double-clic sur l'ordinateur (un seul fichier)
├── web/                           ← version installable sur téléphone (à publier telle quelle)
├── INSTALLER-SUR-TELEPHONE.md     ← installer sur le téléphone, pas à pas
├── GITHUB.md                      ← publier via GitHub Pages (workflow inclus)
├── .github/workflows/deploy.yml   ← tests + audit + publication à chaque push
├── DESIGN.md                      ← règles, modèle de données, habillage, roadmap
├── engine.js                      ← moteur de jeu (logique pure) : la source de vérité des règles
├── template.html                  ← interface (à éditer, puis `node build.js`)
├── build.js                       ← assemble prototype.html + web/
├── tests.js                       ← 81 tests du moteur et de la banque
├── tools/
│   ├── audit.js                   ← audit des 360 questions + 400 parties simulées
│   ├── make-icons.js              ← génère les icônes de l'app depuis le sprite du héros
│   └── serve.js                   ← serveur local pour tester depuis le téléphone (même Wi-Fi)
├── carte-apercu.png · carte-fin.png
└── data/
    ├── schema.json                ← format d'une question
    └── questions.json             ← 360 questions : 12 classes × 5 matières × 6
```

## Essayer

- **Ordinateur** : ouvre `prototype.html`. Chrome de préférence, pour le bouton micro.
- **Téléphone** : publie le dossier `web/` puis ajoute l'app à l'écran d'accueil — voir
  `INSTALLER-SUR-TELEPHONE.md` (Netlify Drop, le plus rapide) ou `GITHUB.md` (GitHub Pages, avec
  tests automatiques à chaque push). L'app tourne ensuite en plein écran et hors ligne.

Le parcours va du CP à la Terminale, château au bout du chemin. Une partie parfaite fait
**120 points en 60 questions**, environ 15 minutes.

## Règles appliquées

1 question par matière et par classe (5 questions par classe) · réponse libre 2 pts, QCM 1 pt ·
une réponse libre fausse impose le QCM sur la question suivante · une erreur de QCM renvoie au
début de la classe et efface les points de la classe · timer 30 s, 1 point pour +15 s, temps
écoulé = −2 points sans reculer.

## Modifier

```bash
node tests.js            # règles + banque (81 tests)
node tools/audit.js      # audit du contenu + 400 parties simulées
node build.js            # régénère prototype.html et web/
node build.js --docs     # idem + copie docs/ (GitHub Pages sans Actions)
node tools/make-icons.js # régénère les icônes (nécessite ImageMagick)
node tools/serve.js      # sert web/ sur le réseau local pour tester au téléphone
```

Ou via npm : `npm test`, `npm run audit`, `npm run build`, `npm run serve`.

Toute règle se change dans `engine.js` (objet `CONFIG` en haut) — jamais dans l'interface.

## Ce qui reste à décider

Voir §8 de `DESIGN.md` : afficher ou non la bonne réponse après une erreur, existence d'un game
over, et ce qui se passe après le Bac.
