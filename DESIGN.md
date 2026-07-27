# Le Quizz du BAC — conception v0.3

App mobile payante (Android + iOS), jouable 100 % hors ligne. Deux modes :

- **Quizz BAC** — le parcours scolaire, du CP à la Terminale, matière par matière, avec cœurs,
  bonus de classe et carte qui se dévoile.
- **Quizz détente** — 30 questions à thèmes (culture générale, cinéma, sport, musique), difficulté
  croissante par paliers de 10, aucune sanction : seul le score final compte.

Parcours des écrans : **écran-titre** — le héros dans une salle de classe devant le tableau, titre
« Le Quizz du BAC », bouton Commencer — puis le **tableau s'ouvre en vortex** (aperçu de la forêt,
spirale, le héros aspiré) → **choix du mode** → **pop-up pseudo** à la première partie, avec une
croix rouge pour passer et jouer sans être classé → partie → **diplôme** ou écran de score →
**classement**.

Note technique : le vortex et l'aperçu de forêt sont dessinés **aux dimensions exactes du tableau**,
sans `clipPath` ni SVG imbriqué — ces deux mécanismes se comportent différemment selon les moteurs
de rendu, et débordaient dans mes vérifications.

Stack retenue : **React Native + Expo** (TypeScript), données en **SQLite local**, vocal via
le **moteur de dictée natif** du téléphone.

---

## 1. Progression

12 niveaux, dans l'ordre :

| # | Niveau | # | Niveau |
|---|--------|---|--------|
| 1 | CP | 7 | 5ème |
| 2 | CE1 | 8 | 4ème |
| 3 | CE2 | 9 | 3ème |
| 4 | CM1 | 10 | 2nde |
| 5 | CM2 | 11 | 1ère |
| 6 | 6ème | 12 | Terminale |

Matières : **Français, Mathématiques, Géographie, Histoire, Anglais** au primaire, plus
**Sciences** (physique, chimie et SVT regroupées) **à partir de la 6ème** — soit 5 matières
jusqu'au CM2 et 6 ensuite. Le moteur déduit les matières d'une classe des pools réellement
remplis : ajouter une matière à une classe se fait donc en ajoutant des questions, sans toucher au
code.

**1 question par matière et par classe** → 5 questions par classe au primaire, 6 au secondaire,
soit **67 questions pour une partie parfaite** et un score maximum de **144 points**
(5 × 5 × 2 + 7 × 6 × 2 = 134, plus 10 points de bonus de classe parfaite au primaire).

Ordre de parcours d'une classe : les matières s'enchaînent dans un ordre fixe (Français →
Maths → Géo → Histoire → Anglais). La bonne réponse en Anglais valide la classe et déclenche
le passage à la suivante, avec un écran de palier.

L'état de progression est donc un couple : `(classe, matière)`. Le moteur garde un
`questionsPerSubject` configurable (à 1) pour pouvoir tester des séries plus longues sans
retoucher le code.

Une partie parfaite dure environ 60 questions × ~15 s = **15 minutes** : c'est court, ce qui
va bien avec un jeu de score à rejouer.

## 2. Répondre à une question

Deux modes, choisis librement par le joueur pour **chaque** question :

| Mode | Points | Échec |
|------|--------|-------|
| **Réponse libre** (clavier ou dictée vocale) | **2 pts** | La question est remplacée par une autre de la même matière, **et cette nouvelle question se joue obligatoirement en choix multiple**. Aucune perte de points ni de position. |
| **Choix multiple** (1 bonne + 4 fausses) | **1 pt** | Retour au **début de la classe** (matière 1, Français). Perte de tous les points gagnés depuis la validation de la classe précédente. |

Conséquence voulue : le mode libre est plus rentable et sans risque immédiat, mais le rater
fait tomber dans le mode risqué. Une erreur libre suivie d'une erreur de QCM renvoie donc au
début de la classe — c'est le vrai coût de l'erreur libre, et il n'y a plus d'exploit possible
(on ne peut pas enchaîner les réponses libres jusqu'à tomber sur une question connue).

`forceMCAfterFreeWrong: 1` dans la config du moteur. La valeur est réglable (2, 3… ou 0 pour
désactiver) si le jeu se révèle trop punitif à l'usage.

### Validation d'une réponse libre

Le moteur normalise avant comparaison : minuscules, accents retirés, ponctuation et articles
initiaux supprimés (« le / la / les / l' »), espaces multiples réduits. Chaque question porte
une **liste de réponses acceptées** (ex. « 1789 », « en 1789 »). Une tolérance de distance de
Levenshtein est appliquée selon la longueur : 0 pour ≤ 4 caractères, 1 pour 5–8, 2 au-delà.
Les réponses numériques sont comparées après extraction du nombre.

Le vocal passe par le même pipeline : la dictée produit du texte, le texte est validé comme
une saisie clavier. Le joueur voit la transcription avant de valider, pour éviter les
frustrations de reconnaissance.

## 3. Timer

- **30 s** par question, barre de progression visible, alerte visuelle sous 10 s.
- **Rachat de temps** : le joueur peut sacrifier **1 point pour +15 s**, autant de fois qu'il
  a de points. Le rachat est possible à tout moment tant que le timer tourne.
- Le rachat ne peut pas faire descendre le score sous 0 : sans point disponible, le bouton
  est désactivé.
- **Expiration du timer** : **−2 points**, une nouvelle question de la même matière est
  proposée, **la place est conservée** (aucun cœur perdu, mais le bonus de classe est annulé). Le score ne descend jamais sous 0, et la pénalité
  réduit d'autant les points « en jeu » sur la classe (on ne peut pas perdre deux fois les
  mêmes points). Un timeout n'impose pas le QCM.

## 3 bis. Cœurs, bonus et rétrogradation (mode BAC)

- Le joueur démarre avec **3 cœurs**.
- Une **erreur de QCM** coûte **un cœur**, en plus du retour au début de la classe et de la perte
  des points de la classe.
- **Plus de cœur** : le joueur **redescend d'une classe**, repart de sa première matière avec
  **3 cœurs neufs**. Les points que cette classe avait rapportés lui sont **retirés** — sinon une
  rétrogradation volontaire permettrait de regagner indéfiniment les mêmes points (la simulation
  atteignait 163 points sur un maximum de 144 avant cette règle). Au CP, on ne descend pas plus
  bas : seuls les cœurs sont rendus.
- **Classe franchie sans aucune faute** (ni erreur de QCM, ni réponse libre fausse, ni timeout) :
  **+2 points** du CP au CM2, **+1 cœur** de la 6ème à la Terminale.

## 4. Score et sauvegarde

Trois compteurs :

- `scoreCourant` — total de la partie en cours ; sert de monnaie pour le rachat de temps.
- `pointsDepuisPalier` — points gagnés depuis la dernière validation de classe ; c'est ce
  montant qui est effacé lors d'une erreur de QCM. Il est réduit par le rachat de temps et par
  les pénalités de timeout, pour qu'un point ne puisse pas être perdu deux fois.
- `meilleurScore` — record persistant, séparé par mode.
- `levelPoints[]` — ce que chaque classe validée a rapporté, pour pouvoir le retirer en cas de
  rétrogradation.
- `pseudo` — choisi par le joueur, utilisé uniquement pour le classement.

Persistance locale uniquement (AsyncStorage pour les préférences, SQLite pour la progression
et l'historique des questions vues) :

```
save = {
  meilleurScore, meilleurNiveauAtteint,
  partieEnCours: { niveau, matiere, index, scoreCourant, pointsDepuisPalier, timestamp },
  vues: [questionId, ...],        // anti-répétition
  stats: { parMatiere: { tauxReussite, modePrefere } }
}
```

Une partie interrompue est reprise à la question en cours. Pas de compte, pas de serveur :
c'est ce qui permet le hors ligne total et simplifie radicalement le RGPD.

## 5. Anti-répétition des questions

Objectif : ne pas revoir la même question avant longtemps.

Avec 1 question par matière, une partie ne consomme que 5 questions par classe : le besoin de
volume vient donc du **rejeu**, pas de la longueur d'une partie. Pour qu'un joueur régulier ne
recroise pas une question avant une vingtaine de parties :

- **État actuel : 804 questions en mode BAC** — 12 par pool sur les 67 couples (classe, matière) —
  et **96 en mode détente** (32 par palier). Les paliers 2 et 3 du mode détente ont été durcis
  après les retours des testeurs, qui les trouvaient trop faciles.
- Prochaine étape de contenu : passer de 12 à 30 par pool, soit environ 2 000 questions.
- Le pool de chaque couple (classe, matière) devrait contenir **au moins 30 questions** en
  production, soit **1 800 questions** (2 400 en cible confortable) : c'est l'objectif de contenu
  qui reste à produire avant publication.
- Tirage : on filtre les questions non vues, on tire au hasard. Quand le pool non vu d'un
  couple est épuisé, on libère les plus anciennes vues (file FIFO), en gardant toujours une
  réserve de 20 % — et jamais deux fois de suite la même question.
- L'historique `vues` est persistant entre les parties : c'est ce qui garantit le renouvellement
  d'une partie à l'autre, et pas seulement à l'intérieur d'une partie.
- Chaque question porte une difficulté interne (1–3) pour lisser la difficulté d'une classe et
  éviter qu'une matière tombe toujours sur sa question la plus dure.

## 5 bis. Pseudo et classement

Le joueur choisit un **pseudo** (3 à 14 caractères) avant sa première partie — pop-up avec une
croix pour passer et jouer sans être classé. Rien d'autre n'est demandé : ni e-mail, ni compte, ni
mot de passe.

À la première ouverture, un **numéro de joueur à 5 chiffres** est tiré au hasard et conservé sur
l'appareil : le classement affiche « Benji #04217 », ce qui évite la confusion entre deux joueurs
au même pseudo. Le pseudo s'affiche en haut du menu, dans une barre cliquable pour le modifier.

- Sans configuration, le classement affiche les parties de l'appareil.
- Avec un projet **Supabase** gratuit (voir `SUPABASE.md`), les scores partent dans une table
  `scores (pseudo, score, mode, level, created_at)` et le classement devient mondial. Les parties
  jouées hors ligne sont mises en file et envoyées au retour du réseau.
- Le classement est filtrable par mode. Le score du joueur est surligné.

## 6. Monétisation

App payante à l'achat (pas d'abonnement, pas de pub — cohérent avec un public familial et
avec le hors ligne). Prix cible 3,99 € / 4,99 €.
Une **démo gratuite** séparée ou un déblocage in-app après le CE2 est le levier le plus
efficace sur les stores : on garde la décision pour plus tard, mais le code doit isoler la
notion de `contenuDebloque` dès maintenant pour ne pas avoir à refactorer.

## 7. Architecture technique visée

```
src/
  engine/          # logique pure, testable, zéro dépendance UI
    state.ts       # machine à états de la partie
    scoring.ts     # points, rachat, pertes
    answer.ts      # normalisation + validation des réponses libres
    picker.ts      # tirage anti-répétition
  data/
    questions.json # banque, embarquée dans le bundle
    db.ts          # SQLite : import initial, index, vues
  ui/              # écrans Expo : Accueil, Jeu, Palier, Résultat, Stats, Réglages
  speech/          # wrapper dictée natif (expo-speech-recognition)
```

Le cœur du jeu est un moteur pur (`engine/`) : c'est lui qu'on teste, et c'est exactement le
code que le prototype HTML valide avant portage.

## 8. Décisions tranchées et points restants

Tranché : 1 question par matière et par classe · QCM imposé dès la première réponse libre
fausse · erreur de QCM = retour au début de la classe · timer expiré = −2 points sans recul.

Restant à décider :

0. Français en Terminale : le programme s'arrête en 1ère. Le jeu garde la matière avec de la
   culture littéraire générale — à valider.

1. Faut-il pouvoir passer une question ? Proposition : non, ça casse la tension.
2. Anglais au CP/CE1 : périmètre très restreint (couleurs, nombres 1–10, animaux, salutations).
3. Vies / fin de partie : y a-t-il un game over, ou la partie ne finit-elle qu'au Bac ?
   Proposition : pas de game over, la punition est la perte de points.
4. Faut-il afficher la bonne réponse après une erreur ? Le prototype le fait (bon pour
   l'apprentissage), mais ça facilite le rejeu de la même question.
5. Le score maximum est de 120 points et une partie parfaite dure ~15 min : est-ce que ça
   suffit comme « fin de jeu », ou faut-il un mode infini / chrono après le Bac ?

## 9. Habillage : carte, thème et retours

### Écran de question

- La **classe est le titre**, centrée en haut (pastille violette), avec 5 pastilles de
  progression dessous (une par matière de la classe).
- **Score** : le mot `SCORE`, trois pièces dessinées, puis le total, dans une pilule blanche.
- **Une seule matière affichée**, en petites capitales non gras juste au-dessus de la question,
  dans la couleur de la matière. Les autres matières ne sont plus listées.

### Carte de progression, révélée au fur et à mesure

Elle remplace l'écran de palier. Rien n'est montré à l'avance : au départ, seule la pancarte
**CP** existe au milieu du paysage. À chaque classe validée, une séquence en trois temps :

1. **le chemin se creuse** depuis la case actuelle (0,9 s, tracé progressif, petits bruits de pas
   dans la terre) ;
2. **la pancarte de la classe suivante apparaît** en grossissant (0,4 s, son de « pop ») ;
3. **le héros marche** jusqu'à elle (1,2 s, sprite à 2 images, ombre au sol, un bip par pas).

Le bouton « Continuer » ne se débloque qu'à l'arrivée. Les classes déjà franchies restent
visibles (pancartes vertes, chemin tracé), la classe courante est en jaune, et **le château
n'apparaît qu'à la toute fin** du chemin.

La carte n'apparaît **qu'au changement de classe** : une erreur de QCM ne fait pas reculer le
héros (on ne redescend jamais de classe), la sanction reste dans l'écran de question.

### Paysage

Le fond est un **paysage pixel généré** (graine fixe, donc toujours identique) : prairie à
nuances, arbres, buissons, rochers, fleurs et un étang. Les décors sont placés sur une grille
avec exclusion automatique des zones du chemin et des pancartes, pour ne jamais masquer le jeu.
Le chemin est une piste de terre à deux tons qui se dessine par `stroke-dashoffset`.

Héros et décors sont dessinés en **rectangles SVG** (`FRAMES`, `tree()`, `bush()`… dans le
template) : aucun fichier image, net à toutes les résolutions, et remplaçable par de vrais
sprites ou un tileset plus tard sans toucher à la logique.

### Thème clair et pop

Fond crème à pois, cartes blanches à bordure épaisse et ombre franche (style comic/sticker),
boutons chunky qui s'enfoncent au clic. Une couleur par matière :
Français violet · Maths bleu · Géographie menthe · Histoire corail · Anglais jaune.

### Sons et animations

Tout est **synthétisé à la volée** (Web Audio en prototype, `expo-av` ou un synth natif dans
l'app) : aucun fichier audio, donc aucun poids ajouté et un fonctionnement hors ligne garanti.

| Événement | Son | Animation |
|-----------|-----|-----------|
| Bonne réponse | arpège montant (mi–la–mi aigu) | la carte pulse, bordure verte, « +2 » qui s'envole |
| Mauvaise réponse | glissando descendant | la carte tremble, bordure corail, bonne réponse révélée |
| Temps écoulé | trois notes descendantes | idem, avec « −2 » |
| Rachat de temps | double bip clair | barre de temps qui repart |
| Classe validée | petite fanfare | carte : chemin qui se creuse, pancarte qui apparaît, héros qui marche |
| Château | fanfare longue | — |

Un bouton 🔊 / 🔇 permet de couper le son (choix mémorisé en local). Le contexte audio n'est
créé qu'au premier geste du joueur, comme l'exigent les navigateurs et iOS.

Délais d'enchaînement : **1 s** après une bonne réponse, **2,2 s** après une erreur (le temps de
lire la bonne réponse).

## 10. Roadmap

| Étape | Contenu |
|-------|---------|
| 0 | Règles figées, schéma de données, prototype jouable, banque complète CP → Terminale, version installable sur téléphone ✅ |
| 1 | Moteur TypeScript + tests unitaires |
| 2 | App Expo : écrans, timer, persistance SQLite, hors ligne |
| 3 | Dictée vocale native |
| 4 | Banque de 1 800 à questions (génération assistée + relecture) |
| 5 | Polish : sons, animations, écran de stats, accessibilité |
| 6 | Builds EAS, fiches stores, TestFlight / piste interne, publication |
