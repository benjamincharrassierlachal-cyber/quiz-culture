# Publier Le Quizz du BAC sur le Play Store

Le jeu est une application web installable (PWA). Pour le Play Store, on l'emballe dans une
**Trusted Web Activity** : une coquille Android qui affiche le site en plein écran, sans barre
d'adresse. Le code du jeu ne change pas, c'est le même `web/` qui tourne.

Compte tenu des délais imposés par Google (voir §2), prévoir **trois semaines** entre le premier
clic et la disponibilité publique.

---

## 0. Le compte (fait)

| | |
|---|---|
| Nom du développeur | **B1JAM1C** |
| Type de compte | Personnel |
| ID du compte | 6932346628049029426 |
| E-mail de contact public | **quizzdubac@gmail.com** |
| Site web déclaré | `https://benjamincharrassierlachal-cyber.github.io/quiz-culture/` |
| Statut | **Identité validée, téléphone vérifié.** Le compte peut créer des applications. |

Décisions prises :

| | |
|---|---|
| Titre sur le Store | **Quizz Culture Générale & BAC** (28 caractères sur 30) |
| Type | Jeu → catégorie *Quiz* |
| Langue par défaut | Français (France) |
| Modèle | **Payante** → profil de paiement marchand obligatoire avant de créer l'app |
| Public cible | 13 ans et plus (à confirmer dans le formulaire *Public cible et contenu*) |
| Nom du package | **`com.b1jam1c.quizzdubac`** — définitif à vie, et visible dans l'URL de la fiche (`play.google.com/store/apps/details?id=…`). Choisi pour ne pas exposer le nom civil. |
| Monétisation | Une seule application. Pas de version gratuite avec publicité : AdMob ne fonctionne pas dans une TWA, et la version web joue déjà le rôle de version gratuite. À rediscuter après le lancement. |

Le titre du Store et le nom affiché sous l'icône sont deux choses différentes : sous l'icône, c'est
le `short_name` du manifeste (« Quizz du BAC »), plus court et plus lisible.

L'adresse `quizzdubac@gmail.com` doit apparaître **à l'identique** dans la fiche du Store et dans
`web/confidentialite.html` — Google compare les deux.

## 1. Ce qu'il faut préparer avant de commencer

| Élément | Détail |
|---|---|
| Compte Google Play Console | **25 $ une seule fois**, pas d'abonnement. Vérification d'identité obligatoire (pièce d'identité, adresse). |
| Type de compte | **Personnel** (ton cas) ou organisation. Le compte personnel impose le test fermé du §2. |
| Nom du package | `com.b1jam1c.quizzdubac` par exemple. **Définitif** : il ne peut jamais être changé. |
| Clé de signature | Un fichier `.keystore` généré une fois. **À sauvegarder précieusement** : le perdre interdit toute mise à jour. |
| Page de confidentialité | Générée par `node build.js` → `web/confidentialite.html`, donc en ligne à `…/confidentialite.html`. Son adresse est demandée dans la fiche. |
| Visuels | Icône 512 × 512, bannière 1024 × 500, au moins 2 captures d'écran par format. |
| Adresse e-mail de contact | Affichée publiquement sur la fiche. |

## 2. Le piège du calendrier : 12 testeurs pendant 14 jours

Depuis fin 2023, un **compte personnel** ne peut pas publier directement en production. Il faut
d'abord :

1. lancer un **test fermé** ;
2. réunir **au moins 12 testeurs** (12 comptes Gmail distincts) ;
3. les garder inscrits **14 jours consécutifs**, avec une activité réelle ;
4. puis demander l'accès à la production, qui est examiné par Google.

C'est la principale raison de compter trois semaines. Autant réunir la liste des 12 personnes
maintenant — famille, amis, collègues — chacune avec l'adresse Gmail utilisée sur son téléphone.

## 3. Le piège technique : `assetlinks.json` doit être à la racine du domaine

Pour que l'application s'ouvre **sans barre d'adresse**, Android vérifie un fichier :

```
https://<domaine>/.well-known/assetlinks.json
```

À la **racine du domaine**, pas dans le sous-dossier du projet. Or le jeu est publié sur
`benjamincharrassierlachal-cyber.github.io/quiz-culture/`. Deux solutions :

- **Créer un second dépôt GitHub nommé exactement `benjamincharrassierlachal-cyber.github.io`**,
  et y déposer `.well-known/assetlinks.json`. Ce dépôt sert la racine du domaine ; le jeu reste
  dans `quiz-culture`. C'est gratuit et suffisant.
- **Ou prendre un nom de domaine** (une dizaine d'euros par an), plus propre pour une app payante,
  et le brancher sur GitHub Pages.

Sans ce fichier, l'app fonctionne quand même mais affiche une barre d'adresse en haut : rédhibitoire
pour une application vendue.

## 4. Emballer le jeu (Bubblewrap)

### L'installation qui marche sous Windows (établie à la dure)

Les trois installateurs automatiques de Bubblewrap sont cassés sous Windows. Voici la
configuration qui fonctionne, à ne pas refaire mais à ne pas casser non plus.

| Élément | Emplacement | Pourquoi |
|---|---|---|
| JDK 17 | `C:\Users\Benjamin\jdk17` | Temurin installé depuis adoptium.net. **Le chemin ne doit contenir aucun espace** : Bubblewrap construit ses commandes sans guillemets, et `C:\Program Files\…` casse la signature de l'APK. |
| Outils SDK | `…\.bubblewrap\android_sdk\cmdline-tools\latest\` | Téléchargés à la main (*Command line tools only*). Ceux que Bubblewrap installe datent de 2020 et sont incompatibles avec Java 17 (`ClassNotFoundException: SdkManagerCli`). |
| Clé de signature | `C:\Users\Benjamin\android.keystore` | À sauvegarder hors de l'ordinateur. |

Le fichier `C:\Users\Benjamin\.bubblewrap\config.json` doit contenir exactement :

```json
{"jdkPath":"C:\\Users\\Benjamin\\jdk17","androidSdkPath":"C:\\Users\\Benjamin\\.bubblewrap\\android_sdk"}
```

Les symptômes rencontrés, si l'un revient un jour :

- *Bubblewrap redemande le JDK à chaque lancement* → il n'a pas écrit `config.json`, le remplir à la main.
- *`ClassNotFoundException: SdkManagerCli`* → outils SDK trop anciens pour Java 17.
- *`Could not determine SDK root`* → les outils ne sont pas dans `cmdline-tools\latest\`.
- *`'C:\Program' n'est pas reconnu`* → un espace dans le chemin du JDK.

### Le projet

Généré dans `C:\Users\Benjamin` (`twa-manifest.json`, `android.keystore`). Pour chaque version :

```powershell
cd $HOME
bubblewrap build
```

Cela produit `app-release-bundle.aab` (le fichier à envoyer à Google) et affiche l'empreinte
SHA-256 de la clé. C'est cette empreinte qu'il faut coller dans `assetlinks.json` :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.b1jam1c.quizzdubac",
    "sha256_cert_fingerprints": ["<empreinte affichée par bubblewrap>"]
  }
}]
```

**Le piège qui a coûté deux jours.** N'écris pas ce fichier à la main. La Play Console le génère,
avec la bonne empreinte, en bas de la page de signature d'application :

```
https://play.google.com/console/u/0/developers/6932346628049029426/app/4973902271913481632/keymanagement
```

section **« Fichier JSON Digital Asset Links »**. Copie ce bloc, point final.

Pourquoi : une application peut avoir **trois** empreintes différentes, et seule la bonne fonctionne.

| Empreinte | Où on la lit | Utilité |
|---|---|---|
| `AE:C8:C9:…` | **bloc JSON généré par la Console** | **la seule qui compte** — clé de signature d'origine, celle que Chrome interroge |
| `08:33:DF:…` | *Clé classique → Empreinte SHA-256* | clé courante après rotation post-quantique — insuffisante seule |
| `AB:4C:42:…` | *Certificat de clé d'importation* | ne sert qu'aux APK construits en local |

Le symptôme quand l'empreinte est fausse : l'application s'installe, se lance, fonctionne — mais
affiche une **barre d'adresse Chrome** en haut. Aucun message d'erreur nulle part, ni sur l'appareil,
ni dans la Console. Et l'API de vérification de Google
(`digitalassetlinks.googleapis.com/v1/statements:list`) répond « valide », puisqu'elle ne fait que
relire le fichier sans le confronter à l'application installée.

Le test qui tranche : installer à la main l'APK local (`app-release-signed.apk`). S'il s'ouvre sans
barre alors que la version du Play Store en affiche une, c'est une question d'empreinte, pas de
configuration.

Les trois empreintes sont déclarées dans `racine/.well-known/assetlinks.json` — les garder toutes.

## 5. Remplir la fiche Play Console

Au-delà des visuels et de la description, trois formulaires demandent de l'attention :

- **Sécurité des données** : déclarer ce que le jeu collecte. Dans notre cas : *pseudo* et *scores*,
  transmis et stockés, non liés à l'identité, non partagés, sans publicité. La page de
  confidentialité générée dit exactement la même chose — les deux doivent concorder, Google compare.
- **Classification du contenu** : questionnaire IARC, aucune violence ni contenu sensible ici.
- **Public cible** : c'est la décision la plus lourde. Si tu déclares viser **les enfants**, l'app
  entre dans le programme *Familles*, avec des règles supplémentaires (pas de publicité ciblée,
  contenu vérifié, etc.). Vu le CP dans le parcours, c'est probablement le cas — et cela n'a rien de
  bloquant, le jeu ne collecte rien de sensible et n'a pas de publicité.

## 6. Application payante

Pour vendre l'app, il faut créer un **profil de paiement marchand** dans la Console (coordonnées
bancaires, informations fiscales). Google prélève une commission sur chaque vente.

Deux remarques honnêtes :

- Une app payante au téléchargement se vend mal sans notoriété. Le modèle courant aujourd'hui est
  gratuit avec un achat unique pour débloquer une partie du contenu — mais dans une TWA, les achats
  intégrés demandent un travail supplémentaire (API Digital Goods), là où le prix au téléchargement
  ne demande rien du tout.
- Le jeu restera accessible gratuitement sur son adresse web publique. Si tu veux vraiment
  monétiser, il faudra à un moment fermer l'accès direct, ou assumer que le web sert de vitrine.

## 7. Et si on ne passait pas par le Play Store ?

Le jeu est **déjà installable** : sur Android, Chrome propose « Ajouter à l'écran d'accueil » et
l'app s'ouvre en plein écran, hors ligne, sans barre d'adresse. Zéro euro, zéro délai, zéro
formulaire, et les mises à jour sont instantanées au lieu de passer par une revue.

Le Play Store apporte la découvrabilité, la confiance et la facturation. Si l'objectif est de faire
jouer une classe ou des proches, l'installation directe suffit largement — et rien n'empêche de
publier plus tard.

## 8. Pour iOS

L'App Store d'Apple n'accepte pas les simples coquilles web : il faut une vraie application
(React Native / Expo, comme prévu dans `DESIGN.md`), un Mac pour construire, et un abonnement
développeur annuel de 99 $. C'est un chantier autrement plus lourd que la TWA Android.
