-- Remove todos os dados de demonstração para início da operação real.
-- Mantém apenas a estrutura base: empresa, perfis/permissões, administrador,
-- parâmetros, status de obra, tipos de aplicação, sistemas de impermeabilização,
-- categorias financeiras, centros de custo gerais e o estoque central.
DO $$
DECLARE
  t text;
  pending int;
  pass int := 0;
  base text[] := ARRAY['companies','roles','role_permissions','users','settings','project_statuses',
                       'application_types','waterproofing_systems','financial_categories',
                       'cost_centers','warehouses'];
BEGIN
  UPDATE public.users SET employee_id = NULL, client_id = NULL
   WHERE email NOT LIKE '%@demo.revolutionimper.com.br';

  LOOP
    pass := pass + 1;
    pending := 0;
    FOR t IN SELECT tablename FROM pg_tables
              WHERE schemaname = 'public' AND tablename <> ALL (base) ORDER BY tablename LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
      EXCEPTION WHEN foreign_key_violation THEN
        pending := pending + 1;
      END;
    END LOOP;
    BEGIN
      DELETE FROM public.warehouses WHERE type <> 'central';
    EXCEPTION WHEN foreign_key_violation THEN pending := pending + 1;
    END;
    BEGIN
      DELETE FROM public.cost_centers WHERE project_id IS NOT NULL OR name LIKE 'Obra %';
    EXCEPTION WHEN foreign_key_violation THEN pending := pending + 1;
    END;
    BEGIN
      DELETE FROM public.users WHERE email LIKE '%@demo.revolutionimper.com.br';
    EXCEPTION WHEN foreign_key_violation THEN pending := pending + 1;
    END;
    EXIT WHEN pending = 0;
    IF pass > 25 THEN
      RAISE EXCEPTION 'Limpeza não concluída: dependências pendentes';
    END IF;
  END LOOP;

  UPDATE public.users SET failed_logins = 0, locked_until = NULL;
END $$;
