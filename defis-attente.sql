-- Le Quizz du BAC — defis en attente dans l'historique + verification avant de jouer
-- A coller dans Supabase : SQL Editor, puis Run.
-- Ce fichier ne contient que du SQL : pas de balise Markdown a retirer.

-- L'historique inclut desormais les defis que J'AI lances et qui attendent une reponse.
-- Le score adverse y vaut NULL : le jeu l'affiche « ?? ».
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
   where d.from_tag = p_tag                       -- y compris « en attente » : c'est ma trace
  union all
  select d.id, d.etat, coalesce(d.resolved_at, d.created_at),
         d.to_pseudo, d.to_score, d.to_seconds,
         d.from_pseudo,
         left(d.from_tag, 2) || repeat('*', char_length(d.from_tag) - 3) || right(d.from_tag, 1),
         d.from_score, d.from_seconds,
         d.abandon_par, 'cible'::text
    from defis d
   where d.to_tag = p_tag and d.etat <> 'en attente'   -- ceux que je dois relever sont ailleurs
  order by 3 desc
  limit greatest(1, least(p_max, 200));
$$;

-- Peut-on lancer ce defi ? Memes controles que defi_lancer, mais SANS rien creer.
-- Appelee avant la partie : plus personne ne joue trente questions pour se voir refuser.
create or replace function public.defi_possible(
  p_from_tag text, p_to_pseudo text, p_to_masque text)
returns text language plpgsql security definer set search_path = public as $$
declare v_to text; v_n int;
begin
  perform defis_perimer();
  select count(*), min(tag) into v_n, v_to from players
   where lower(pseudo) = lower(p_to_pseudo)
     and char_length(tag) = char_length(p_to_masque)
     and left(tag, 2) = left(p_to_masque, 2)
     and right(tag, 1) = right(p_to_masque, 1);
  if v_n = 0 then return 'joueur introuvable'; end if;
  if v_n > 1 then return 'plusieurs joueurs correspondent'; end if;
  if v_to = p_from_tag then return 'on ne se defie pas soi-meme'; end if;
  if exists (select 1 from defis
              where from_tag = p_from_tag and to_tag = v_to and etat = 'en attente') then
    return 'un defi est deja en attente contre ce joueur';
  end if;
  if (select count(*) from defis
       where from_tag = p_from_tag and created_at > now() - interval '1 hour') >= 20 then
    return 'trop de defis lances';
  end if;
  return 'ok';
end; $$;

revoke all on function public.defi_historique(text, int) from public;
revoke all on function public.defi_possible(text, text, text) from public;
grant execute on function public.defi_historique(text, int) to anon;
grant execute on function public.defi_possible(text, text, text) to anon;

-- Verification, en remplacant par ton numero complet :
-- select * from public.defi_historique('96089');
-- select public.defi_possible('96089', 'Testeur', '87**8');
