-- Keep screen-sized rendering in the account preference whitelist.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('corvex_private.carbon_account_settings(uuid,jsonb)'::regprocedure);
 if position('in(''960x540'',''1280x720''' in definition)=0 then raise exception 'Unexpected resolution whitelist';end if;
 definition:=replace(definition,'in(''960x540'',''1280x720''','in(''native'',''960x540'',''1280x720''');
 execute definition;
end $$;
