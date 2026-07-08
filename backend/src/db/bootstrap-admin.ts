/**
 * Bootstrap del primer admin (arranque en frío) — vía Keycloak.
 *
 * Crea (o reutiliza) el usuario en Keycloak con rol de realm `admin` y su fila
 * en user_profiles (PK = UUID de Keycloak, keycloak_sub incluido). Idempotente.
 * La contraseña se pasa por BOOTSTRAP_ADMIN_PASSWORD.
 *
 * Requiere KEYCLOAK_URL / KEYCLOAK_SERVICE_CLIENT_SECRET configurados y que el
 * service account de colorados-service tenga manage-users/view-users.
 *
 * Uso: BOOTSTRAP_ADMIN_PASSWORD=... npx tsx src/db/bootstrap-admin.ts
 */
import { supabaseAdmin } from '../config/supabase';
import { createKeycloakUser, findKeycloakUserByEmail } from '../services/keycloakAdminService';

const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@coloradosdrive.com';
const FULL_NAME = process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador';
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

async function main(): Promise<void> {
  if (!PASSWORD) throw new Error('Falta BOOTSTRAP_ADMIN_PASSWORD');

  // 1. Usuario en Keycloak (reutiliza si ya existe).
  let keycloakId: string;
  const existing = await findKeycloakUserByEmail(EMAIL);
  if (existing) {
    keycloakId = existing.id;
    console.log('usuario Keycloak ya existía:', keycloakId);
  } else {
    const created = await createKeycloakUser({
      email: EMAIL,
      fullName: FULL_NAME,
      password: PASSWORD,
      role: 'admin',
    });
    if (created.error || !created.userId) {
      throw new Error(`createKeycloakUser: ${created.error ?? 'sin usuario'}`);
    }
    keycloakId = created.userId;
    console.log('usuario Keycloak creado:', keycloakId);
  }

  // 2. Perfil admin. Si ya hay un perfil con ese email (usuario legacy de
  //    Supabase), se conserva su PK y solo se enlaza el keycloak_sub.
  const { data: existingProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .ilike('email', EMAIL)
    .maybeSingle();

  if (existingProfile) {
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ keycloak_sub: keycloakId, full_name: FULL_NAME, role: 'admin' })
      .eq('id', (existingProfile as { id: string }).id);
    if (error) throw new Error(`user_profiles (update): ${error.message}`);
  } else {
    const { error } = await supabaseAdmin.from('user_profiles').insert({
      id: keycloakId,
      keycloak_sub: keycloakId,
      email: EMAIL,
      full_name: FULL_NAME,
      role: 'admin',
    });
    if (error) throw new Error(`user_profiles (insert): ${error.message}`);
  }

  console.log(`user_profiles admin OK → ${EMAIL} (${keycloakId})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
