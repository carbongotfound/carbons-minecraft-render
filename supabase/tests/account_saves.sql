-- Temporary fixtures only; all changes are rolled back.
begin;
do $test$
declare a jsonb;b jsonb;r jsonb;w uuid:=gen_random_uuid();w2 uuid:=gen_random_uuid();rejected boolean:=false;
begin
 a:=public.corvex_join('Save test A','#73a4ae');b:=public.corvex_join('Save test B','#73a4ae');
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'load');assert r->>'owner'=a->>'id';
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'save',0,'{"inventory":[{"id":"diamond","count":3}],"xp":12}');assert (r->>'ok')::boolean;
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w2,'load');assert r->'state'->'inventory'->0->>'id'='diamond';
 r:=public.carbon_account_save((a->>'id')::uuid,a->>'token',w,'save',1,'{"inventory":[]}');assert r->>'reason'='account_open_elsewhere';
 r:=public.carbon_account_save((b->>'id')::uuid,b->>'token',w,'load');assert r->'state'='null'::jsonb;
 begin perform public.carbon_account_save((a->>'id')::uuid,b->>'token',w,'load');exception when others then rejected:=true;end;assert rejected;
end $test$;
rollback;
