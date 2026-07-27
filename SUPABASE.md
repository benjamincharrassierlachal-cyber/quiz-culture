# Activer le classement en ligne (Supabase)

Sans configuration, le jeu fonctionne déjà : le classement affiche alors **tes parties sur cet
appareil**. Cette page ajoute le classement mondial. Compte gratuit, pas de carte bancaire.

Ce qui sera stocké, et rien d'autre : **un pseudo, un score, un mode, une date**. Aucun e-mail,
aucun identifiant, aucun compte joueur.

---

## 1. Créer le projet (3 minutes)

1. Va sur **https://supabase.com** → *Start your project* → connexion **avec GitHub**.
2. **New project** : nom `quiz-du-bac`, mot de passe de base de données (garde-le, on n'en aura
   pas besoin ici), région **Europe (Paris ou Frankfurt)**. Attends ~1 minute la création.

## 2. Créer la table

Dans le menu de gauche : **SQL Editor** → *New query*. Colle ceci, puis **Run**.

```sql
create table public.scores (
  id         bigint generated always as identity primary key,
  pseudo     text        not null check (char_length(pseudo) between 3 and 14),
  score      int         not null check (score >= 0 and score <= 1000),
  mode       text        not null check (mode in ('bac', 'detente')),
  level      text,
  created_at timestamptz not null default now()
);

-- sécurité : chacun peut lire le classement et déposer un score, rien de plus
alter table public.scores enable row level security;

create policy "lecture du classement" on public.scores
  for select to anon using (true);

create policy "depot d un score" on public.scores
  for insert to anon with check (true);

create index scores_classement on public.scores (mode, score desc);
```

Tu dois voir « Success. No rows returned ».

## 3. Récupérer les deux informations

Menu de gauche → **Project Settings** (l'engrenage) → **API** :

| À copier | Où |
|---|---|
| **Project URL** | `https://xxxxxxxx.supabase.co` |
| **anon public** | une longue clé commençant par `eyJ…` |

La clé `anon` est **faite pour être publique** : les règles ci-dessus limitent ce qu'elle permet
(lire le classement, ajouter une ligne). Ne copie **jamais** la clé `service_role`.

## 4. Brancher le jeu

Ouvre `data/leaderboard.json` et remplis les deux champs :

```json
{
  "url": "https://xxxxxxxx.supabase.co",
  "anonKey": "eyJhbGciOi..."
}
```

Puis reconstruis et publie :

```bash
node build.js
git add -A && git commit -m "Classement en ligne" && git push
```

Au prochain lancement, l'écran Classement affichera « Classement en ligne ». Les parties jouées
sans réseau sont mises de côté et envoyées automatiquement au retour de la connexion.

## Vérifier que ça marche

- Joue une partie courte en mode détente, puis ouvre le classement : ton pseudo doit apparaître.
- Dans Supabase : **Table Editor → scores**, la ligne doit être là.

## Bon à savoir

- **Triche possible** : n'importe qui sachant lire le code peut déposer un score arbitraire. Pour
  un test entre amis, c'est sans importance. Si le classement devient sérieux, on passera par une
  *edge function* qui vérifie la partie avant d'enregistrer — c'est un ajout, pas une refonte.
- **Nettoyage** : pour ne garder qu'un score par pseudo, on ajoutera plus tard une vue
  `select pseudo, max(score) …`. Aujourd'hui chaque partie crée une ligne.
- **Quotas gratuits** : largement suffisants ici (quelques milliers de lignes, quelques Ko).
- **Repartir de zéro** : `delete from public.scores;` dans le SQL Editor.
