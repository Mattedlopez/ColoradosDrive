import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './index';

/**
 * Cliente Supabase con service role (acceso completo, solo backend).
 * Supabase es únicamente la base de datos: la identidad vive en Keycloak.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
