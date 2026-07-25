# Tester Quiz Culture sur ton téléphone

Le dossier `web/` est prêt à publier. Il contient l'app complète (360 questions), un manifeste
et un service worker : une fois installée, elle démarre en plein écran et **fonctionne sans
connexion**.

## 1. Publier (2 minutes, gratuit)

1. Sur ton ordinateur, ouvre **https://app.netlify.com/drop**
2. Glisse-dépose le **dossier `web`** (le dossier entier, pas les fichiers un par un) dans la zone.
3. Netlify affiche une adresse du type `https://quelque-chose-12345.netlify.app`.
   C'est ton lien de test. Sans compte, il reste actif quelques heures ; avec un compte gratuit,
   il reste permanent et tu peux le renommer.

Le HTTPS est indispensable : c'est lui qui autorise l'installation et le micro.

## 2. Ouvrir sur le téléphone

Envoie-toi le lien (SMS, mail, WhatsApp) ou affiche un QR code, puis ouvre-le sur le téléphone.

**Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil* / *Installer l'application*.

**iPhone (Safari — obligatoirement Safari)** : bouton Partager <span>&#x2191;</span> →
*Sur l'écran d'accueil* → *Ajouter*.

Une icône apparaît. Lancée depuis cette icône, l'app s'ouvre sans barre d'adresse, et le
meilleur score est conservé sur le téléphone.

## 3. Vérifier le mode hors ligne

Ouvre l'app une première fois avec du réseau (elle se met en cache), puis passe en mode avion et
relance-la : tout doit fonctionner, questions comprises.

## Bon à savoir pour le test

- **Micro** : Android/Chrome reconnaît bien la dictée. Sur iPhone, Safari ne propose pas l'API de
  dictée web : le bouton 🎤 affiche un message. C'est une limite du navigateur, pas du jeu — dans
  la vraie app Expo, on utilisera le moteur natif iOS.
- **Son** : le premier son ne se déclenche qu'après ton premier appui sur l'écran (règle des
  navigateurs). Si ton iPhone est en mode silencieux, le son reste coupé.
- **Mise à jour** : après un `node build.js`, redéploie le dossier `web`. L'app installée se met
  à jour au prochain lancement avec du réseau (le service worker est versionné automatiquement).

## Si tu préfères ne rien publier

- **Android** : envoie-toi simplement `prototype.html` et ouvre-le. Tout est dans ce seul fichier.
- **Réseau local** : depuis le dossier `web/`, lance `python -m http.server 8080` sur ton PC, puis
  ouvre `http://IP-DU-PC:8080` sur le téléphone (même Wi-Fi). Attention : en `http://`,
  l'installation et le micro sont désactivés, mais le jeu se teste très bien.
