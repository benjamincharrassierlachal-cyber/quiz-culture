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

## Les défis (mode détente)

Troisième bloc à coller dans le **SQL Editor**, puis **Run**.

Un défi oppose deux joueurs sur **la même liste de questions**, obtenue en imposant la graine du
tirage aléatoire. Le lanceur joue d'abord, l'adversaire relève ensuite. Les scores de défi
n'entrent pas dans le classement classique.

Deux précautions guident ce schéma. D'abord, **le numéro complet d'un joueur ne quitte jamais le
serveur** : il sert de preuve pour récupérer un compte. Le jeu envoie le pseudo et le numéro
masqué tel qu'il s'affiche (`48***3`), et `defi_lancer` retrouve la cible lui-même — en refusant
si plusieurs joueurs correspondent. Ensuite, **aucune policy de lecture** n'est posée sur la table :
tout passe par les fonctions, faute de quoi n'importe qui pourrait lire les défis des autres.

```sql
create table if not exists public.defis (
  id           bigint generated always as identity primary key,
  seed         bigint  not null,
  mode         text    not null default 'detente' check (mode = 'detente'),
  from_tag     text    not null check (from_tag ~ '^[0-9]{5,6}$'),
  from_pseudo  text    not null,
  from_score   int     not null,
  from_seconds int     not null,
  to_tag       text    not null check (to_tag ~ '^[0-9]{5,6}$'),
  to_pseudo    text    not null,
  to_score     int,
  to_seconds   int,
  etat         text    not null default 'en attente'
               check (etat in ('en attente', 'releve', 'refuse', 'abandonne', 'expire')),
  abandon_par  text    check (abandon_par in ('lanceur', 'cible')),
  vu_lanceur   boolean not null default false,   -- le résultat a-t-il été consulté ?
  vu_cible     boolean not null default false,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  constraint defi_pas_soi_meme check (from_tag <> to_tag)
);
create index if not exists defis_cible   on public.defis (to_tag, etat);
create index if not exists defis_lanceur on public.defis (from_tag, etat);

alter table public.defis enable row level security;   -- aucune policy : tout passe par les fonctions

-- passe en « expire » les défis sans réponse depuis 7 jours
create or replace function public.defis_perimer()
returns void language sql security definer set search_path = public as $$
  update defis set etat = 'expire', resolved_at = now()
   where etat = 'en attente' and created_at < now() - interval '7 days';
$$;

-- lance un défi : le lanceur a déjà joué, son score est déposé ici
create or replace function public.defi_lancer(
  p_from_tag text, p_from_pseudo text,
  p_to_pseudo text, p_to_masque text,
  p_score int, p_seconds int, p_seed bigint, p_abandon boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_to text; v_n int; v_id bigint;
begin
  perform defis_perimer();
  -- le numéro masqué : deux premiers chiffres, dernier chiffre, même longueur
  select count(*), min(tag) into v_n, v_to from players
   where lower(pseudo) = lower(p_to_pseudo)
     and char_length(tag) = char_length(p_to_masque)
     and left(tag, 2) = left(p_to_masque, 2)
     and right(tag, 1) = right(p_to_masque, 1);
  if v_n = 0 then raise exception 'joueur introuvable'; end if;
  if v_n > 1 then raise exception 'plusieurs joueurs correspondent'; end if;
  if v_to = p_from_tag then raise exception 'on ne se defie pas soi-meme'; end if;
  if exists (select 1 from defis
              where from_tag = p_from_tag and to_tag = v_to and etat = 'en attente') then
    raise exception 'un defi est deja en attente contre ce joueur';
  end if;
  if (select count(*) from defis
       where from_tag = p_from_tag and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'trop de defis lances';
  end if;
  -- si le lanceur a abandonné, le défi est clos d'emblée : il compte comme sa défaite,
  -- et l'adversaire n'en voit jamais rien — une victoire sans avoir joué n'aurait aucun sens
  insert into defis (seed, from_tag, from_pseudo, from_score, from_seconds, to_tag, to_pseudo,
                     etat, abandon_par, vu_cible, resolved_at)
  values (p_seed, p_from_tag, p_from_pseudo, coalesce(p_score, 0), coalesce(p_seconds, 0),
          v_to, p_to_pseudo,
          case when p_abandon then 'abandonne' else 'en attente' end,
          case when p_abandon then 'lanceur' end,
          p_abandon,
          case when p_abandon then now() end)
  returning id into v_id;
  return v_id;
end; $$;

-- ce qui m'attend : défis reçus, et résultats que je n'ai pas encore consultés
create or replace function public.defi_boite(p_tag text)
returns table (id bigint, role text, etat text, seed bigint,
               adversaire text, adversaire_masque text,
               mon_score int, son_score int, mes_secondes int, ses_secondes int,
               created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform defis_perimer();
  return query
  select * from (
    select d.id, 'cible'::text as role, d.etat, d.seed,
           d.from_pseudo,
           left(d.from_tag, 2) || repeat('*', char_length(d.from_tag) - 3) || right(d.from_tag, 1),
           d.to_score, d.from_score, d.to_seconds, d.from_seconds, d.created_at
      from defis d
     where d.to_tag = p_tag and (d.etat = 'en attente' or not d.vu_cible)
    union all
    select d.id, 'lanceur'::text, d.etat, d.seed,
           d.to_pseudo,
           left(d.to_tag, 2) || repeat('*', char_length(d.to_tag) - 3) || right(d.to_tag, 1),
           d.from_score, d.to_score, d.from_seconds, d.to_seconds, d.created_at
      from defis d
     where d.from_tag = p_tag and d.etat <> 'en attente' and not d.vu_lanceur
  ) t
  order by t.created_at desc;
end; $$;

-- relever (p_accepte vrai, avec score) ou refuser
create or replace function public.defi_repondre(
  p_id bigint, p_tag text, p_accepte boolean,
  p_score int default null, p_seconds int default null, p_abandon boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare d defis;
begin
  select * into d from defis where id = p_id and to_tag = p_tag for update;
  if not found then raise exception 'defi introuvable'; end if;
  if d.etat <> 'en attente' then raise exception 'defi deja traite'; end if;
  if not p_accepte then
    update defis set etat = 'refuse', resolved_at = now(), vu_cible = true where id = p_id;
    return 'refuse';
  end if;
  update defis set etat = case when p_abandon then 'abandonne' else 'releve' end,
                   abandon_par = case when p_abandon then 'cible' end,
                   to_score = coalesce(p_score, 0), to_seconds = coalesce(p_seconds, 0),
                   resolved_at = now(), vu_cible = true
   where id = p_id;
  return case when p_abandon then 'abandonne' else 'releve' end;
end; $$;

-- marque un résultat comme consulté, pour éteindre la pastille
create or replace function public.defi_vu(p_id bigint, p_tag text)
returns void language sql security definer set search_path = public as $$
  update defis set vu_cible   = true where id = p_id and to_tag   = p_tag;
  update defis set vu_lanceur = true where id = p_id and from_tag = p_tag;
$$;

-- mon tableau de bord : gagnés, perdus, refusés, en attente
create or replace function public.defi_bilan(p_tag text)
returns table (gagnes int, perdus int, refuses int, attente int)
language sql security definer set search_path = public as $$
  select
    (select count(*) from defis where (etat = 'releve' and (
       (from_tag = p_tag and (from_score > to_score
          or (from_score = to_score and from_seconds < to_seconds)))
    or (to_tag = p_tag and (to_score > from_score
          or (to_score = from_score and to_seconds < from_seconds)))))
    or (etat = 'abandonne' and abandon_par = 'cible' and from_tag = p_tag))::int,
    (select count(*) from defis where
       (etat = 'releve' and (
          (from_tag = p_tag and (from_score < to_score
             or (from_score = to_score and from_seconds > to_seconds)))
       or (to_tag = p_tag and (to_score < from_score
             or (to_score = from_score and to_seconds > from_seconds)))))
    or (etat = 'abandonne' and abandon_par = 'cible'   and to_tag   = p_tag)
    or (etat = 'abandonne' and abandon_par = 'lanceur' and from_tag = p_tag))::int,
    (select count(*) from defis where etat = 'refuse' and to_tag = p_tag)::int,
    (select count(*) from defis where etat = 'en attente' and to_tag = p_tag)::int;
$$;

revoke all on function public.defi_lancer(text, text, text, text, int, int, bigint, boolean) from public;
revoke all on function public.defi_boite(text) from public;
revoke all on function public.defi_repondre(bigint, text, boolean, int, int, boolean) from public;
revoke all on function public.defi_vu(bigint, text) from public;
revoke all on function public.defi_bilan(text) from public;
revoke all on function public.defis_perimer() from public;
grant execute on function public.defi_lancer(text, text, text, text, int, int, bigint, boolean) to anon;
grant execute on function public.defi_boite(text) to anon;
grant execute on function public.defi_repondre(bigint, text, boolean, int, int, boolean) to anon;
grant execute on function public.defi_vu(bigint, text) to anon;
grant execute on function public.defi_bilan(text) to anon;
```

Règles retenues, et pourquoi :

- **Un seul défi en attente** entre deux mêmes joueurs, et vingt lancés par heure au maximum :
  sans cela, un joueur peut noyer un autre sous les défis.
- **Sept jours** sans réponse et le défi expire, sans conséquence pour personne.
- **L'abandon du lanceur** est enregistré comme sa défaite, mais le défi est clos aussitôt et
  l'adversaire n'en voit jamais rien : lui accorder une victoire sans avoir joué n'aurait pas de
  sens. La colonne `abandon_par` note lequel des deux a renoncé.
- **L'abandon de celui qui relève** vaut défaite pour lui, et victoire pour le lanceur.
- **À score égal, le temps départage**, comme au classement.
