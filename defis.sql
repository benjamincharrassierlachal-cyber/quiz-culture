-- Le Quizz du BAC — les defis (mode detente)
-- A coller dans Supabase : SQL Editor, puis Run.
-- Ce fichier ne contient que du SQL : pas de balise Markdown a retirer.

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
  select d.id, 'cible'::text, d.etat, d.seed,
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
   order by 12 desc;
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
