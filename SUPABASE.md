# Activer le classement en ligne (Supabase)

Sans configuration, le jeu fonctionne déjà : le classement affiche alors **tes parties sur cet
appareil**. Cette page ajoute le classement mondial. Compte gratuit, pas de carte bancaire.

Ce qui sera stocké, et rien d'autre : **un pseudo, un numéro de joueur à 5 chiffres, un score, un
mode, une date**. Aucun e-mail, aucun identifiant, aucun compte joueur. Le numéro est tiré au
hasard sur l'appareil et permet de distinguer deux joueurs qui choisissent le même pseudo
(« Benji #04217 » et « Benji #91055 »).

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
  tag        text        check (tag ~ '^[0-9]{5}$'),   -- numéro de joueur : « Benji #04217 »
  score      int         not null check (score >= 0 and score <= 1000),
  mode       text        not null check (mode in ('bac', 'detente')),
  level      text,
  seconds    int         check (seconds >= 0),          -- temps de jeu : départage les ex æquo
  created_at timestamptz not null default now()
);

-- sécurité : chacun peut lire le classement et déposer un score, rien de plus
alter table public.scores enable row level security;

create policy "lecture du classement" on public.scores
  for select to anon using (true);

create policy "depot d un score" on public.scores
  for insert to anon with check (true);

create index scores_classement on public.scores (mode, score desc, seconds asc);
```

Tu dois voir « Success. No rows returned ».

### Si la table existe déjà

Si tu avais créé la table avant l'ajout du temps de jeu, une seule ligne suffit dans le
**SQL Editor** — les scores déjà enregistrés restent en place, sans temps :

```sql
alter table public.scores add column if not exists seconds int check (seconds >= 0);
```

## 2 bis. Les numéros de joueur (identité)

Second bloc à coller dans le **SQL Editor**, puis **Run**. Il crée la table des joueurs, la
fonction qui attribue un numéro unique, celle qui permet de récupérer son compte sur un autre
appareil, et il élargit la colonne `tag` aux numéros à 6 chiffres.

```sql
-- les numéros passent à 6 chiffres (les anciens à 5 restent valides)
alter table public.scores drop constraint if exists scores_tag_check;
alter table public.scores add constraint scores_tag_check check (tag ~ '^[0-9]{5,6}$');

create table if not exists public.players (
  tag        text primary key check (tag ~ '^[0-9]{5,6}$'),
  pseudo     text not null check (char_length(pseudo) between 3 and 14),
  created_at timestamptz not null default now()
);
create index if not exists players_pseudo on public.players (lower(pseudo));

create table if not exists public.recover_attempts (
  id     bigint generated always as identity primary key,
  pseudo text not null,
  ok     boolean not null,
  at     timestamptz not null default now()
);

-- aucune policy : personne ne lit ces tables directement, seules les deux fonctions y touchent
alter table public.players enable row level security;
alter table public.recover_attempts enable row level security;

-- attribue (ou confirme) le numéro d'un joueur
create or replace function public.claim_pseudo(p_pseudo text, p_wanted text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_tag text; i int := 0;
begin
  if char_length(p_pseudo) < 3 or char_length(p_pseudo) > 14 then
    raise exception 'pseudo invalide';
  end if;
  if p_wanted is not null and p_wanted ~ '^[0-9]{5,6}$'
     and not exists (select 1 from players where tag = p_wanted) then
    insert into players (tag, pseudo) values (p_wanted, p_pseudo);
    return p_wanted;
  end if;
  loop
    i := i + 1;
    v_tag := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from players where tag = v_tag) or i > 50;
  end loop;
  insert into players (tag, pseudo) values (v_tag, p_pseudo);
  return v_tag;
end; $$;

-- retrouve un compte : pseudo + numéro complet, 10 essais ratés par heure au maximum
create or replace function public.recover_player(p_pseudo text, p_tag text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_fail int; v_ok boolean;
begin
  select count(*) into v_fail from recover_attempts
   where lower(pseudo) = lower(p_pseudo) and not ok and at > now() - interval '1 hour';
  if v_fail >= 10 then raise exception 'trop d essais'; end if;
  select exists (select 1 from players
                  where tag = p_tag and lower(pseudo) = lower(p_pseudo)) into v_ok;
  insert into recover_attempts (pseudo, ok) values (p_pseudo, v_ok);
  return v_ok;
end; $$;

revoke all on function public.claim_pseudo(text, text) from public;
revoke all on function public.recover_player(text, text) from public;
grant execute on function public.claim_pseudo(text, text) to anon;
grant execute on function public.recover_player(text, text) to anon;
```

Comment ça se comporte côté joueur : à la validation du pseudo, le jeu demande un numéro au
serveur en proposant celui déjà utilisé sur l'appareil — les identités existantes sont donc
conservées. Le classement n'affiche qu'une partie du numéro (`Benji #48***3`) ; le joueur voit le
sien en entier dans la fenêtre du pseudo, avec l'invitation à le noter. Sur un autre téléphone,
« J'ai déjà un compte » demande pseudo + numéro complet. Sans réseau, le jeu attribue un numéro
local et le fait officialiser à la première occasion.

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

## Si le classement reste vide alors que tout semble branché

En cas de refus du serveur, le message exact s'affiche sous le classement, avec un bouton
**Réessayer l'envoi**. `Scores.health()` et `Scores.testInsert()` restent disponibles dans le code
(console du navigateur) pour un diagnostic complet : état du stockage, type de clé, envoi de test
avec la réponse brute de Supabase.

Piège rencontré une fois : le service worker mettait en cache les appels au classement et
interceptait les envois. Il ne touche désormais **qu'aux fichiers de l'app** ; tout ce qui part
vers un autre domaine passe directement par le réseau. Si un téléphone se comporte encore
bizarrement, c'est un ancien service worker en mémoire : fermer complètement l'app et la rouvrir
suffit à le remplacer.

## Vérifier que ça marche

- Joue une partie courte en mode détente, puis ouvre le classement : ton pseudo doit apparaître.
- Dans Supabase : **Table Editor → scores**, la ligne doit être là.

## Si tu avais déjà créé la table

La colonne du numéro de joueur est arrivée après. Une seule ligne à exécuter dans le SQL Editor :

```sql
alter table public.scores add column if not exists tag text check (tag ~ '^[0-9]{5}$');
```

## Bon à savoir

- **Triche possible** : n'importe qui sachant lire le code peut déposer un score arbitraire. Pour
  un test entre amis, c'est sans importance. Si le classement devient sérieux, on passera par une
  *edge function* qui vérifie la partie avant d'enregistrer — c'est un ajout, pas une refonte.
- **Nettoyage** : pour ne garder qu'un score par joueur, on ajoutera plus tard une vue
  `select pseudo, tag, max(score) … group by pseudo, tag`. Aujourd'hui chaque partie crée une ligne.
- **Unicité du numéro** : il est tiré au hasard parmi 100 000 sur l'appareil, ce qui suffit à
  séparer des homonymes dans un petit groupe. Pour une unicité garantie, il faudra la faire
  attribuer par le serveur — c'est un ajout, pas une refonte.
- **Quotas gratuits** : largement suffisants ici (quelques milliers de lignes, quelques Ko).
- **Repartir de zéro** : `delete from public.scores;` dans le SQL Editor.
