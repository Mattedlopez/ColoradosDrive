-- ============================================================================
-- Migración 028 — Identidad Keycloak (control de identidades central)
-- ============================================================================
-- Contexto: ColoradosDrive (Sistema A) migra su autenticación de Supabase
-- GoTrue a Keycloak (OIDC directo). Supabase queda SOLO como base de datos.
--
-- Qué hace esta migración:
--   a) Agrega user_profiles.keycloak_sub (UUID, único) + índice: mapea el
--      claim `sub` del token de Keycloak al perfil local.
--   b) Índice único por lower(email): el fallback de login por email es
--      case-insensitive y no debe ser ambiguo.
--   c) Suelta la FK user_profiles.id → auth.users(id): los usuarios nuevos
--      ya no existen en GoTrue (su PK será el UUID de Keycloak).
--   d) Re-apunta TODAS las demás FKs que referencian auth.users(id) hacia
--      public.user_profiles(id), preservando la semántica ON DELETE
--      (CASCADE / SET NULL / etc.).
--
-- ⚠ ANTES DE EJECUTAR: correr 028_precheck.sql y resolver huérfanos y
--   emails duplicados. Si hay huérfanos, el ADD CONSTRAINT falla y la
--   transacción hace rollback completo (comportamiento deseado).
--
-- Ejecutar en Supabase → SQL Editor (todo el archivo de una vez).
-- ============================================================================

BEGIN;

-- (a) Columna de mapeo al `sub` de Keycloak + índice.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS keycloak_sub UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_keycloak_sub
  ON public.user_profiles (keycloak_sub);

-- (b) Email único case-insensitive (necesario para el fallback por email
--     con self-heal en el middleware de auth).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower
  ON public.user_profiles (lower(email));

-- (c) Soltar el anclaje del perfil a auth.users (GoTrue deja de ser la
--     fuente de identidad).
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

-- (d) Re-apuntar las FKs de tablas de la APLICACIÓN (esquema public) que
--     referencian auth.users(id) — excepto la propia user_profiles, ya
--     soltada arriba — hacia public.user_profiles(id), preservando la
--     acción ON DELETE original:
--       'c' → CASCADE · 'n' → SET NULL · 'r' → RESTRICT ·
--       'd' → SET DEFAULT · 'a' → NO ACTION
--     ⚠ Solo esquema public: las tablas internas de Supabase (auth.identities,
--     auth.sessions, storage.objects, …) también referencian auth.users pero
--     pertenecen a supabase_auth_admin y NO deben tocarse (error 42501).
DO $$
DECLARE
  fk RECORD;
  on_delete TEXT;
BEGIN
  FOR fk IN
    SELECT
      c.conname,
      c.conrelid::regclass AS child_table,
      (SELECT a.attname
         FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = c.conkey[1]) AS child_column,
      c.confdeltype
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conrelid <> 'public.user_profiles'::regclass
      AND c.connamespace = 'public'::regnamespace  -- solo tablas de la app
  LOOP
    on_delete := CASE fk.confdeltype
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'NO ACTION'
    END;

    RAISE NOTICE 'Re-apuntando FK % en % (columna %, ON DELETE %)',
      fk.conname, fk.child_table, fk.child_column, on_delete;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child_table, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.user_profiles(id) ON DELETE %s',
      fk.child_table, fk.conname, fk.child_column, on_delete
    );
  END LOOP;
END $$;

COMMIT;
