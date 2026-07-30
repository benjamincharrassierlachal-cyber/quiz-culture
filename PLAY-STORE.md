# Publier Le Quizz du BAC sur le Play Store

Le jeu est une application web installable (PWA). Pour le Play Store, on l'emballe dans une
**Trusted Web Activity** : une coquille Android qui affiche le site en plein écran, sans barre
d'adresse. Le code du jeu ne change pas, c'est le même `web/` qui tourne.

Compte tenu des délais imposés par Google (voir §2), prévoir **trois semaines** entre le premier
clic et la disponibilité publique.

---

## 1. Ce qu'il faut préparer avant de commencer

| Élément | Détail |
|---|---|
| Compte Google Play Console | **25 $ une seule fois**, pas d'abonnement. Vérification d'identité obligatoire (pièce d'identité, adresse). |
| Type de compte | **Personnel** (ton cas) ou organisation. Le compte personnel impose le test fermé du §2. |
| Nom du package | `com.lachal.quizzdubac` par exemple. **Définitif** : il ne peut jamais être changé. |
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

Sur l'ordinateur, une fois pour toutes :

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://benjamincharrassierlachal-cyber.github.io/quiz-culture/manifest.webmanifest
```

Bubblewrap pose quelques questions : nom de l'application, nom du package, couleur de la barre
d'état, et propose de télécharger le JDK et le SDK Android nécessaires — accepter.

Points à surveiller pendant l'init :

- **Target API level** : viser **API 36 (Android 16)**. Depuis le 31 août 2026, les nouvelles
  applications doivent cibler Android 16 ; en dessous, Google refuse l'envoi.
- **Signing key** : laisser Bubblewrap créer la clé, puis **sauvegarder le fichier `.keystore` et
  son mot de passe** ailleurs que sur l'ordinateur.

Puis, à chaque version :

```bash
bubblewrap build
```

Cela produit `app-release-bundle.aab` (le fichier à envoyer à Google) et affiche l'empreinte
SHA-256 de la clé. C'est cette empreinte qu'il faut coller dans `assetlinks.json` :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.lachal.quizzdubac",
    "sha256_cert_fingerprints": ["<empreinte affichée par bubblewrap>"]
  }
}]
```

**Attention** : si tu utilises la signature gérée par Google (Play App Signing, activée par défaut),
c'est l'empreinte **fournie par la Play Console** qu'il faut mettre dans ce fichier, pas celle de ta
clé locale. La Console l'affiche dans *Configuration → Intégrité de l'application*.

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
