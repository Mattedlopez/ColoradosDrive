-- ============================================================================
-- Pre-chequeo para la migración 028 — SOLO LECTURA (no modifica nada)
-- ============================================================================
-- Ejecutar en Supabase → SQL Editor ANTES de 028_keycloak_identity.sql.
--
-- 1) Huérfanos por tabla: filas cuyas columnas FK apuntan a auth.users(id)
--    pero cuyo valor NO existe en public.user_profiles(id). Si hay huérfanos,
--    el re-apuntado de FKs de la 028 fallará (rollback completo). Hay que
--    crear el perfil faltante o limpiar/anular esas filas antes de migrar.
--    (El resultado sale como NOTICE en la pestaña de mensajes del editor.)
--
-- 2) Emails duplicados por lower(email) en user_profiles: impedirían crear
--    el índice único idx_user_profiles_email_lower. Resolver duplicados
--    (corregir o eliminar perfiles) antes de migrar.
-- ============================================================================

-- 1) Huérfanos por cada FK que referencia auth.users(id)
DO $$
DECLARE
  fk RECORD;
  orphan_count BIGINT;
BEGIN
  RAISE NOTICE '=== Pre-chequeo 028: huérfanos por FK hacia auth.users(id) ===';
  FOR fk IN
    SELECT
      c.conname,
      c.conrelid::regclass AS child_table,
      (SELECT a.attname
         FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = c.conkey[1]) AS child_column
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conrelid <> 'public.user_profiles'::regclass
      AND c.connamespace = 'public'::regnamespace  -- solo tablas de la app (igual que 028)
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %s t WHERE t.%I IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.user_profiles p WHERE p.id = t.%I)',
      fk.child_table, fk.child_column, fk.child_column
    ) INTO orphan_count;

    IF orphan_count > 0 THEN
      RAISE NOTICE '✗ %.% (FK %): % fila(s) huérfana(s) — RESOLVER antes de la 028',
        fk.child_table, fk.child_column, fk.conname, orphan_count;
    ELSE
      RAISE NOTICE '✓ %.% (FK %): sin huérfanos',
        fk.child_table, fk.child_column, fk.conname;
    END IF;
  END LOOP;
  RAISE NOTICE '=== Fin del chequeo de huérfanos ===';
END $$;

-- 2) Emails duplicados por lower(email) — deben ser 0 filas
SELECT
  lower(email)   AS email_lower,
  COUNT(*)       AS duplicados,
  array_agg(id)  AS profile_ids
FROM public.user_profiles
GROUP BY lower(email)
HAVING COUNT(*) > 1
ORDER BY duplicados DESC;
