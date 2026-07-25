# Publier Quiz Culture avec GitHub

Tout est déjà en place dans le projet : un `package.json`, un `.gitignore`, et un workflow
GitHub Actions qui **lance les tests, l'audit des questions, construit l'app et la publie**
sur GitHub Pages à chaque `git push`.

Le dépôt doit avoir **`quiz-culture/` comme racine** (donc `README.md`, `build.js` et
`.github/` directement à la racine du dépôt).

---

## 0. Où taper les commandes ?

Le mot **`bash`** au-dessus des blocs gris n'est pas une commande : c'est juste une étiquette qui
indique le langage, pour la coloration. **Tu ne le tapes pas.** Ce qu'on colle, ce sont les
lignes en dessous, dans un **terminal**.

Sur Windows, le terminal à utiliser s'appelle **Git Bash**, installé avec Git :

1. Installe **Git for Windows** : https://git-scm.com/download/win (accepte les options par défaut).
2. Installe aussi **Node.js LTS** : https://nodejs.org (c'est lui qui fait tourner `node build.js`).
3. Ouvre le dossier `quiz-culture` dans l'explorateur de fichiers.
4. **Clic droit dans le dossier → « Open Git Bash here »** (parfois sous « Afficher plus
   d'options » sur Windows 11). Une fenêtre noire s'ouvre, déjà positionnée dans le bon dossier :
   c'est là qu'on colle.
5. Coller se fait avec **clic droit → Paste**, ou **Maj + Inser**. Chaque ligne se valide avec
   Entrée ; on peut aussi coller les six lignes d'un coup.

Pour vérifier que tout est en place, colle ceci — deux numéros de version doivent s'afficher :

```bash
git --version
node --version
```

### Attention à l'emplacement du dossier

Si le chemin affiché par Git Bash contient `AppData` et `local-agent-mode-sessions`, tu es dans
l'espace de travail **temporaire** de Claude : il peut être vidé. Copie le projet dans un dossier
à toi avant de créer le dépôt (`./.` copie aussi les fichiers cachés comme `.github`) :

```bash
mkdir -p ~/Documents/quiz-culture
cp -r ./. ~/Documents/quiz-culture/
cd ~/Documents/quiz-culture
ls -a
```

`~` désigne `C:\Users\TON-NOM`. La liste doit contenir `.github`, `.gitignore`, `build.js`,
`engine.js`, `data`, `web`. C'est depuis **ce** dossier que tu enchaînes sur l'étape 1.

**Tu préfères éviter le terminal ?** C'est possible : passe par **GitHub Desktop** (§1 bis).

## 1. Créer le dépôt et pousser

Sur github.com : bouton **New repository**, nomme-le par exemple `quiz-culture`, laisse-le vide
(pas de README, pas de .gitignore — ils existent déjà ici). Puis, dans Git Bash ouvert sur le
dossier du projet :

```bash
git init
git add .
git commit -m "Quiz Culture : prototype complet, 360 questions"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/quiz-culture.git
git push -u origin main
```

Remplace `TON-PSEUDO` par ton identifiant GitHub. Au moment du `git push`, une fenêtre GitHub
s'ouvre pour t'identifier : accepte, et c'est réglé une fois pour toutes. (Si on te demande un
mot de passe dans le terminal, ce n'est pas celui de ton compte mais un *personal access
token* : Settings → Developer settings → Tokens. La fenêtre de connexion est plus simple.)

## 1 bis. Sans terminal, avec GitHub Desktop

1. Installe **GitHub Desktop** : https://desktop.github.com — connecte-toi à ton compte.
2. **File → Add local repository**, choisis le dossier `quiz-culture`. Il propose de créer un
   dépôt : accepte.
3. Écris un message en bas à gauche, clique **Commit to main**, puis **Publish repository**
   (décoche « Keep this code private » si tu veux GitHub Pages gratuitement).

Le résultat est identique. Il te faudra toujours Node.js si tu veux relancer `node build.js` toi-même —
mais avec le workflow, GitHub le fait pour toi à chaque publication.

## 2. Activer GitHub Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

C'est tout. Retourne dans l'onglet **Actions** : le workflow « Tests et publication GitHub
Pages » tourne, et affiche l'adresse à la fin :

```
https://TON-PSEUDO.github.io/quiz-culture/
```

Cette adresse est en **https**, donc l'installation sur l'écran d'accueil et le micro
fonctionnent. Tous les chemins de l'app sont relatifs : elle marche sans souci dans un
sous-dossier `/quiz-culture/`.

Ouvre-la sur ton téléphone, puis suis `INSTALLER-SUR-TELEPHONE.md` pour l'ajouter à l'écran
d'accueil.

**Dépôt privé** : GitHub Pages sur un dépôt privé demande un compte payant (Pro/Team). Pour un
test, garde le dépôt **public**, ou passe par Netlify (gratuit même en privé).

## 3. Le cycle de travail ensuite

Toujours dans Git Bash, ouvert sur le dossier du projet (le `#` et ce qui suit sont des
commentaires, tu peux les coller sans risque) :

```bash
node tests.js          # les règles du jeu
node tools/audit.js    # les 360 questions + 400 parties simulées
node build.js          # régénère prototype.html et web/
git add -A && git commit -m "ce que j'ai changé" && git push
```

Le push relance les tests côté GitHub : **si un test ou l'audit échoue, rien n'est publié**.
L'app déjà installée sur ton téléphone se met à jour toute seule au lancement suivant avec du
réseau (le service worker est versionné à chaque build).

---

## Variante sans GitHub Actions

Si tu préfères éviter les workflows, GitHub Pages peut servir directement un dossier du dépôt,
mais seulement `/` ou `/docs`. D'où :

```bash
node build.js --docs      # crée docs/, copie conforme de web/
git add -A && git commit -m "publication" && git push
```

Puis **Settings → Pages → Source : Deploy from a branch → `main` / `/docs`**.

Inconvénient : il faut penser à relancer `node build.js --docs` avant chaque push, et rien ne
vérifie les tests. C'est pour ça que le workflow est la voie recommandée.

## Variante Netlify ou Vercel branchés sur le dépôt

Utile si tu veux des URL de prévisualisation par branche, ou un dépôt privé gratuit :

| Réglage | Valeur |
|---|---|
| Build command | `node build.js` |
| Publish directory | `web` |
| Node version | 20 |

Chaque push redéploie automatiquement.

## Tester sans rien publier

```bash
node tools/serve.js
```

Affiche une adresse `http://192.168.x.x:8080` à ouvrir sur le téléphone (même Wi-Fi). En
`http://`, l'installation et le micro sont désactivés, mais le jeu se teste très bien.
