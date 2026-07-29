# Le Quizz du BAC — conception v0.5

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

### Valider sans masquer le clavier

Un testeur perdait du temps à refermer le clavier du téléphone pour atteindre le bouton Valider.
Le champ est donc dans un **formulaire** : la touche d'envoi du clavier (`enterkeyhint="send"`,
« OK » ou « ➤ » selon le téléphone) valide directement, sans fermer quoi que ce soit. Le bouton
Valider reste là pour ceux qui préfèrent, et le champ **remonte au centre de l'écran** quand le
clavier s'ouvre, pour que la question et le bouton restent visibles.

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

## 3 ter. Pause, sauvegarde et publication

Le bouton **Pause** (dans le bandeau, pas un message du navigateur) ouvre un écran à quatre issues :

| Choix | Effet |
|---|---|
| **Continuer à jouer** | retour à la question, chrono remis à 30 s |
| **M'arrêter ici** | la partie est mise de côté ; un bouton **Reprendre** apparaît sur l'écran-titre |
| **Publier mon score** | le score rejoint le classement **de la classe atteinte**, la partie s'arrête |
| **Abandonner** | retour à l'accueil, sans enregistrer ni sauvegarder |

Le **temps restant fait partie de la sauvegarde** : mettre la partie de côté sur une question
difficile ne redonne pas 30 secondes. À la reprise, le chrono repart avec le temps qu'il restait,
avec un plancher de 5 secondes pour relire la question (ce supplément n'est pas compté comme du
temps de réflexion). Le bouton Pause, lui, ne remet pas non plus le chrono à zéro.

La partie est aussi **sauvegardée automatiquement après chaque question** : fermer l'app ne perd
rien. `engine.serialize()` produit une photographie JSON (classe, matière, question en cours,
score, cœurs, points par classe, questions vues) et `engine.restore()` la reconstruit. La
sauvegarde est effacée à la fin de la partie, à la publication et en cas d'abandon.

## 3 quater. Classement par classe

Comparer un score de CP et un score de Terminale n'a pas de sens : le classement du mode BAC est
donc **groupé par classe**, de la Terminale vers le CP, chaque section triée par score puis, **à
score égal, par temps de jeu croissant** : le plus rapide passe devant, ce qui réduit fortement les
ex æquo. Un bouton « Ma classe » filtre sur la dernière classe publiée par le joueur. Le mode
détente garde un classement unique, puisque toutes les parties font 30 questions.

Le temps retenu est le **temps passé sur les questions**, pas le temps écoulé : le moteur additionne,
à chaque réponse, les secondes réellement consommées (`budget − timeLeft`, rachats de temps inclus).
Une pause, un appel ou une app fermée trois jours n'alourdissent donc pas le chrono. Une ligne de
classement sans temps (partie d'avant cette règle) est classée après les autres à score égal.

## 3 quinquies. Jokers (mode BAC, à partir de la 6ème)

Trois aides, **une seule utilisation chacune par partie**, **6 points** l'unité. Elles n'existent
qu'en mode BAC et n'apparaissent **qu'à partir de la 6ème** — le primaire sert d'apprentissage.
Un joker est refusé si le score est inférieur à 6 : on ne joue jamais à crédit.

| Joker | Effet | Coût |
|---|---|---|
| **40/60** | passe la question en QCM et **barre 3 mauvaises réponses en rouge** — il reste la bonne et une autre | 6 pts |
| **Changer** | remplace la question par une autre de la même matière (l'abandonnée est marquée comme vue) | 6 pts |
| **Passer** | saute la question sans marquer de point, la place est conservée | 6 pts |

À l'entrée en 6ème, un **écran d'annonce** s'intercale entre la carte et la première question :
« Bravo ! Tu disposes maintenant de 3 jokers », les trois aides l'une sous l'autre avec leur
pictogramme, leur utilité en une ligne et leur coût. Il ne s'affiche qu'une fois par partie (y
compris pour une partie reprise en secondaire dont les jokers sont intacts).

Les trois aides sont ensuite présentées en **pastilles rondes dorées**, façon pièce, avec un
pictogramme au trait (propositions barrées, double flèche circulaire, flèche qui saute par-dessus)
et leur nom dessous — le coût n'est plus rappelé sous chaque pastille, l'écran d'annonce l'a dit.
Une aide déjà utilisée reste visible, grisée et barrée.

Deux garde-fous : le 40/60 **ne barre jamais la bonne réponse**, et **toute aide utilisée annule le
bonus de classe sans faute** (sinon un joker permettrait de gagner +2 points ou une vie en évitant
la difficulté). Les jokers restants font partie de la sauvegarde : reprendre une partie ne les rend pas.

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
- L'historique `vues` est **écrit après chaque question** (1 200 identifiants conservés), et non
  plus seulement en fin de partie : c'est ce qui garantit le renouvellement d'une partie à l'autre,
  y compris si le joueur s'arrête en cours de route.
- Le mode détente applique la même mémoire : les questions déjà vues ne sont servies qu'en dernier
  recours. Mesure sur cinq parties consécutives : **14 % de répétitions avant, 0 % après** en mode
  BAC ; en détente, il a fallu porter la banque de 96 à 180 questions pour passer de 36 % à 0 %,
  puisqu'une partie en consomme 30.
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

### Numéro de joueur

Le numéro à 5 chiffres est attaché **au pseudo**, pas à l'appareil : `quizculture.tags` conserve un
couple pseudo → numéro. Deux joueurs qui alternent sur le même téléphone gardent chacun le leur, et
revenir à un pseudo déjà utilisé redonne le même numéro. Le premier pseudo créé hérite du numéro
déjà affiché, pour ne pas changer d'identité en cours de route ; un joueur sans pseudo utilise le
numéro de l'appareil.

La fenêtre du pseudo liste aussi les **comptes déjà utilisés sur l'appareil** (pseudo + numéro, du
plus récent au plus ancien) : un appui suffit pour reprendre le sien. Personne ne perd son numéro
parce qu'un autre joueur est passé après lui.

Quand le classement en ligne est branché, le numéro est **attribué par Supabase** (table `players`,
fonction `claim_pseudo`) et devient unique pour tout le monde. Il compte alors 6 chiffres, et le
jeu propose au serveur le numéro déjà utilisé sur l'appareil : personne ne change d'identité au
passage. Sans réseau, un numéro local est attribué puis officialisé à la première occasion.

Le numéro sert à la fois d'identifiant public et de preuve, ce qui impose de ne jamais l'afficher
en entier ailleurs que chez son propriétaire : le classement et la barre du menu montrent
`Benji #48***3`, la fenêtre du pseudo l'affiche en clair avec l'invitation à le noter. Pour
récupérer son compte sur un autre appareil, « J'ai déjà un compte » demande pseudo + numéro
complet ; `recover_player` refuse au-delà de **10 essais ratés par heure**, ce qui rend le fait de
deviner les trois chiffres masqués sans intérêt. Aucun code supplémentaire à retenir.

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

Le bouton son a été retiré : couper le son du téléphone suffit, et la place est mieux employée par
le **bouton « i »** qui ouvre la page **Les règles** (parchemin, sceau de cire), accessible depuis
tous les écrans. Ouverte pendant une question, elle met le chrono en attente et le reprend au retour.
Le contexte audio n'est créé qu'au premier geste du joueur, comme l'exigent les navigateurs et iOS.

Délais d'enchaînement : **1 s** après une bonne réponse, **4,2 s** après une erreur — deux secondes
de plus qu'au départ, les testeurs n'avaient pas le temps de lire la bonne réponse. Pendant ce retour, l'écran affiche l'énoncé de la **question à laquelle le
joueur vient de répondre**, pas celle que le moteur a déjà tirée : sans cette précaution, la
question suivante apparaissait le temps d'un éclair au moment de valider.

## 10. Roadmap

| Étape | Contenu |
|-------|---------|
| 0 | Règles figées, schéma de données, prototype jouable, banque complète CP → Terminale, version installable sur téléphone ✅ |
| 1 | Moteur TypeScript + tests unitaires |
| 2 | App Expo : écrans, timer, persistance SQLite, hors ligne |
| 3 | Dictée vocale native |
| 4 | Banque de 2 000 questions : 30 par pool (génération assistée + relecture) |
| 5 | Polish : sons, animations, écran de stats, accessibilité |
| 6 | Builds EAS, fiches stores, TestFlight / piste interne, publication |
