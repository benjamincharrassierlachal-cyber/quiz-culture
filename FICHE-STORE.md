# Les formulaires de la fiche Play Store

Réponses à donner, dans l'ordre du bloc « Décrire le contenu de votre application ».
Règle générale : **ces déclarations doivent concorder avec `web/confidentialite.html`**. Google
compare les deux, et un écart est un motif de rejet fréquent.

---

## 1. Règles de confidentialité

Un seul champ, l'adresse de la page :

```
https://benjamincharrassierlachal-cyber.github.io/quiz-culture/confidentialite.html
```

## 2. Informations de connexion (accès à l'application)

→ **« Toutes les fonctionnalités sont disponibles sans identifiants particuliers »**

Le jeu n'a ni compte, ni mot de passe, ni écran de connexion. Le pseudo est un simple libellé
choisi librement. L'examinateur de Google doit pouvoir tout voir sans rien recevoir de toi.

## 3. Annonces

→ **« Non, mon application ne contient pas d'annonces »**

## 4. Classification du contenu (questionnaire IARC)

- **Adresse e-mail** : `quizzdubac@gmail.com`
- **Catégorie** : *Jeu* → sous-catégorie **Quiz / jeu de réflexion**

Puis le questionnaire. Tout est **Non** : violence, sexualité, langage grossier, drogues, alcool,
tabac, jeux d'argent, contenu effrayant, discrimination.

Trois questions demandent de l'attention, à répondre **Oui** :

| Question | Pourquoi |
|---|---|
| Les utilisateurs peuvent-ils saisir du contenu affiché aux autres ? | Oui : le pseudo choisi apparaît dans le classement public. |
| L'application partage-t-elle la localisation ? | **Non.** |
| L'application permet-elle d'acheter des biens numériques ? | **Non** — l'app est payante au téléchargement, ce qui n'est pas un achat intégré. |

Le pseudo public est le seul point sensible : le déclarer peut relever légèrement la classification,
mais le taire serait une fausse déclaration. On le déclare.

## 5. Public cible et contenu

- **Tranches d'âge** : cocher **13-15**, **16-17**, **18 et plus**. Ne pas cocher les tranches
  inférieures : une Trusted Web Activity est **incompatible** avec le programme Familles, Bubblewrap
  l'avertit explicitement.
- **Votre application attire-t-elle involontairement les enfants ?** → **Non**. Le thème scolaire
  pourrait le laisser croire, mais ni les visuels ni la présentation ne ciblent les enfants.
- **Programme Famille** → ne pas y participer.

## 6. Sécurité des données

Deux types de données collectées, tous deux **facultatifs** (rien n'est envoyé tant que le joueur
ne publie pas de score) :

| Donnée | Catégorie Google | Collectée | Partagée | Finalité |
|---|---|---|---|---|
| Pseudo + numéro de joueur | Informations personnelles → **ID utilisateur** | Oui | Non | Fonctionnalités de l'application |
| Score, mode, classe, temps | Actions dans l'application → **Autres actions** | Oui | Non | Fonctionnalités de l'application |

Réponses aux questions générales :

- **Les données sont-elles chiffrées en transit ?** → **Oui** (tout passe en HTTPS).
- **Peut-on demander la suppression de ses données ?** → **Oui**, par e-mail à `quizzdubac@gmail.com`.
- **Collecte obligatoire ?** → **Non**, facultative pour les deux.

« Partagée » signifie transmise à un tiers pour son propre usage. L'hébergement chez Supabase est un
sous-traitant technique : ce n'est pas un partage, on répond **Non**.

---

## Ce qui reste après ces six formulaires

- Fiche du Store : titre, description courte (80 caractères), description longue (4 000)
- Icône 512 × 512, bannière 1024 × 500, au moins 2 captures d'écran
- Catégorie de l'application et coordonnées
- **Prix** de l'application
- Puis le test fermé : 12 testeurs, 14 jours
