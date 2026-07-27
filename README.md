# Le Quizz du BAC — prototype complet

```
quiz-culture/
├── prototype.html                 ← à ouvrir en double-clic sur l'ordinateur (un seul fichier)
├── web/                           ← version installable sur téléphone (à publier telle quelle)
├── INSTALLER-SUR-TELEPHONE.md     ← installer sur le téléphone, pas à pas
├── GITHUB.md                      ← publier via GitHub Pages (workflow inclus)
├── .github/workflows/deploy.yml   ← tests + audit + publication à chaque push
├── DESIGN.md                      ← règles, modèle de données, habillage, roadmap
├── engine.js                      ← moteur de jeu (logique pure) : la source de vérité des règles
├── scores.js                      ← pseudo, meilleurs scores, classement (local ou Supabase)
├── SUPABASE.md                    ← activer le classement en ligne, pas à pas
├── template.html                  ← interface (à éditer, puis `node build.js`)
├── build.js                       ← assemble prototype.html + web/
├── tests.js                       ← 96 tests du moteur et des deux banques
├── tools/
│   ├── audit.js                   ← audit du contenu + 400 parties BAC et 200 détente simulées
│   ├── uitest.js                  ← déroule les deux modes dans un faux DOM (8 scénarios)
│   ├── make-icons.js              ← génère les icônes de l'app depuis le sprite du héros
│   └── serve.js                   ← serveur local pour tester depuis le téléphone (même Wi-Fi)
├── carte-apercu.png · carte-fin.png · diplome-apercu.png · ecrans-apercu.png
└── data/
    ├── schema.json                ← format d'une question
    ├── questions.json             ← mode BAC : 804 questions, 12 par pool sur les 67 pools
    ├── detente.json               ← mode détente : 96 questions, 32 par palier de difficulté
    └── leaderboard.json           ← URL + clé Supabase (vide = classement local)
```

## Essayer

- **Ordinateur** : ouvre `prototype.html`. Chrome de préférence, pour le bouton micro.
- **Téléphone** : publie le dossier `web/` puis ajoute l'app à l'écran d'accueil — voir
  `INSTALLER-SUR-TELEPHONE.md` (Netlify Drop, le plus rapide) ou `GITHUB.md` (GitHub Pages, avec
  tests automatiques à chaque push). L'app tourne ensuite en plein écran et hors ligne.

**Quizz BAC** : du CP à la Terminale, château au bout du chemin. 3 cœurs, bonus de classe
parfaite, diplôme à l'arrivée. Partie parfaite : **144 points en 67 questions**, ~15 minutes.

**Quizz détente** : 30 questions à thèmes, difficulté croissante, aucune sanction. Maximum
60 points.

## Règles appliquées

1 question par matière et par classe (5 au primaire, 6 dès la 6ème avec les Sciences) · réponse
libre 2 pts, QCM 1 pt · une réponse libre fausse impose le QCM sur la question suivante · une
erreur de QCM renvoie au début de la classe, efface ses points et coûte un cœur · 3 cœurs perdus
font redescendre d'une classe avec 3 cœurs neufs · classe sans faute : +2 points (primaire) ou
+1 cœur (secondaire) · timer 30 s, 1 point pour +15 s, temps écoulé = −2 points sans reculer.
En mode détente : mêmes points, aucune pénalité, on enchaîne les 30 questions.

## Modifier

```bash
node tests.js            # règles + banques (96 tests)
node tools/audit.js      # audit du contenu + 400 parties simulées
node tools/uitest.js     # parcours complet de l'interface, sans navigateur
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
