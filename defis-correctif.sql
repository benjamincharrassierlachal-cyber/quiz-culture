-- Correctif : defi_boite triait sur une colonne inexistante (order by 12 pour 11 colonnes),
-- ce qui faisait échouer la fonction et renvoyait une boîte vide au joueur défié.
-- A coller dans Supabase : SQL Editor, puis Run.

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
    -- les défis que j'ai reçus : en attente de ma réponse, ou résultat pas encore consulté
    select d.id, 'cible'::text as role, d.etat, d.seed,
           d.from_pseudo,
           left(d.from_tag, 2) || repeat('*', char_length(d.from_tag) - 3) || right(d.from_tag, 1),
           d.to_score, d.from_score, d.to_seconds, d.from_seconds, d.created_at
      from defis d
     where d.to_tag = p_tag and (d.etat = 'en attente' or not d.vu_cible)
    union all
    -- ceux que j'ai lancés et dont le sort est scellé, tant que je ne les ai pas vus
    select d.id, 'lanceur'::text, d.etat, d.seed,
           d.to_pseudo,
           left(d.to_tag, 2) || repeat('*', char_length(d.to_tag) - 3) || right(d.to_tag, 1),
           d.from_score, d.to_score, d.from_seconds, d.to_seconds, d.created_at
      from defis d
     where d.from_tag = p_tag and d.etat <> 'en attente' and not d.vu_lanceur
  ) t
  order by t.created_at desc;
end; $$;

revoke all on function public.defi_boite(text) from public;
grant execute on function public.defi_boite(text) to anon;

-- Vérification : remplace 93070 par le numéro du joueur défié, tu dois voir une ligne.
-- select * from public.defi_boite('93070');
