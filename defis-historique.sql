-- Le Quizz du BAC — historique des defis + recherche d'adversaire
-- A coller dans Supabase : SQL Editor, puis Run.
-- Ce fichier ne contient que du SQL : pas de balise Markdown a retirer.

-- Tous mes défis tranchés, du plus récent au plus ancien.
-- « moi » et « lui » sont déjà remis dans le bon sens : le jeu n'a plus à savoir
-- si j'étais le lanceur ou la cible.
create or replace function public.defi_historique(p_tag text, p_max int default 60)
returns table (id bigint, etat text, quand timestamptz,
               mon_pseudo text, mon_score int, mes_secondes int,
               son_pseudo text, son_masque text, son_score int, ses_secondes int,
               abandon_par text, je_suis text)
language sql security definer set search_path = public as $$
  select d.id, d.etat, coalesce(d.resolved_at, d.created_at),
         d.from_pseudo, d.from_score, d.from_seconds,
         d.to_pseudo,
         left(d.to_tag, 2) || repeat('*', char_length(d.to_tag) - 3) || right(d.to_tag, 1),
         d.to_score, d.to_seconds,
         d.abandon_par, 'lanceur'::text
    from defis d
   where d.from_tag = p_tag and d.etat <> 'en attente'
  union all
  select d.id, d.etat, coalesce(d.resolved_at, d.created_at),
         d.to_pseudo, d.to_score, d.to_seconds,
         d.from_pseudo,
         left(d.from_tag, 2) || repeat('*', char_length(d.from_tag) - 3) || right(d.from_tag, 1),
         d.from_score, d.from_seconds,
         d.abandon_par, 'cible'::text
    from defis d
   where d.to_tag = p_tag and d.etat <> 'en attente'
  order by 3 desc
  limit greatest(1, least(p_max, 200));
$$;

-- Recherche d'un adversaire par début de pseudo.
-- Le numéro complet ne sort jamais : seule sa forme masquée est renvoyée, celle-là même
-- que defi_lancer sait retrouver. Deux caractères minimum, pour ne pas servir l'annuaire.
create or replace function public.defi_chercher(p_debut text, p_max int default 20)
returns table (pseudo text, masque text)
language sql security definer set search_path = public as $$
  select p.pseudo,
         left(p.tag, 2) || repeat('*', char_length(p.tag) - 3) || right(p.tag, 1)
    from players p
   where char_length(p_debut) >= 2
     and lower(p.pseudo) like lower(p_debut) || '%'
   order by lower(p.pseudo), p.created_at
   limit greatest(1, least(p_max, 50));
$$;

revoke all on function public.defi_historique(text, int) from public;
revoke all on function public.defi_chercher(text, int) from public;
grant execute on function public.defi_historique(text, int) to anon;
grant execute on function public.defi_chercher(text, int) to anon;

-- Verification, en remplacant par ton numero complet :
-- select * from public.defi_historique('96089');
-- select * from public.defi_chercher('gui');
