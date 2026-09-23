begin;
do $test$
declare a jsonb;b jsonb;r jsonb; old_state jsonb;w uuid:=gen_random_uuid();rejected boolean:=false;
begin
 a:=public.corvex_join('Recovery test A','#73a4ae');
 perform public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'load');
 perform public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'save',0,'{"inventory":[{"id":"diamond","count":8}],"xp":20}');
 perform public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'checkpoint',1);
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'restore',1,'{"inventory":[{"id":"gold","count":2}],"xp":3}');
 assert (r->>'ok')::boolean;
 old_state:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'read',1)->'state';assert old_state->'inventory'->0->>'count'='8';
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'restore',2,old_state);assert (r->>'ok')::boolean;
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'history');assert jsonb_array_length(r->'history')=2;
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'restore',1,'{"inventory":[]}');assert r->>'reason'='save_conflict';
 -- Losing online-session freshness must not lose account identity or progress.
 update corvex_private.sessions set expires_at=now()-interval '10 days' where id=(a->>'id')::uuid;
 b:=public.corvex_join('Recovery test B','#73a4ae');
 assert exists(select 1 from corvex_private.sessions where id=(a->>'id')::uuid);
 r:=public.carbon_survival_join_v3('Recovery test A','#73a4ae',a->>'token');assert r->>'id'=a->>'id';
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'load');assert r->'state'->'inventory'->0->>'count'='8';
 begin perform public.carbon_account_save((a->>'id')::uuid,b->>'token',w,'history');exception when others then rejected:=true;end;assert rejected;
 rejected:=false;
 begin perform public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'restore',3,jsonb_build_object('owner',b->>'id','inventory','[]'::jsonb));exception when others then rejected:=true;end;assert rejected;
end $test$;
rollback;
