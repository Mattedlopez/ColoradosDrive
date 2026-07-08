/**
 * certificationService — notificación A→B de examen definitivo aprobado.
 *
 * Cuando un alumno aprueba el examen definitivo, este servicio arma la trama
 * {cedula, nombre, email, tipoLicencia, resultado, fecha}, la cifra con Vault
 * Transit y la envía a CampusRide (Sistema B) autenticándose con el token de
 * servicio de Keycloak (client_credentials de colorados-service).
 */

import { config } from '../config';
import { supabaseAdmin } from '../config/supabase';
import { encryptWithTransit } from './vaultClient';
import { getServiceToken } from './keycloakTokenService';

export interface CertificationPayload {
  cedula: string;
  nombre: string;
  email: string;
  tipoLicencia: string;
  resultado: 'aprobado';
  /** Fecha de aprobación en ISO 8601. */
  fecha: string;
}

/** Resuelve el curso (tipo de licencia) del examen: course_id directo o vía subject. */
async function resolveTipoLicencia(examId: string): Promise<string> {
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('subject_id, course_id')
    .eq('id', examId)
    .single();

  let courseId: string | null = (exam?.course_id as string | null) ?? null;
  if (!courseId && exam?.subject_id) {
    const { data: subject } = await supabaseAdmin
      .from('subjects')
      .select('course_id')
      .eq('id', exam.subject_id)
      .single();
    courseId = (subject?.course_id as string | null) ?? null;
  }

  if (!courseId) return 'General';

  const { data: course } = await supabaseAdmin
    .from('courses')
    .select('name')
    .eq('id', courseId)
    .single();
  return (course?.name as string | undefined) || 'General';
}

/**
 * Notifica a CampusRide que el alumno aprobó el examen definitivo.
 * No-op (con warning) si la integración no está configurada
 * (CAMPUSRIDE_API_URL o VAULT_ADDR vacíos). Lanza en cualquier fallo real
 * (el caller decide si es fire-and-forget).
 */
export async function notifyExamPassed(
  userId: string,
  examId: string,
  score: number,
): Promise<void> {
  if (!config.campusride.apiUrl || !config.vault.addr) {
    console.warn(
      '[certification] CAMPUSRIDE_API_URL o VAULT_ADDR no configurados; se omite la notificación A→B.',
    );
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('cedula, full_name, email')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error(`No se encontró el perfil del alumno ${userId} para certificar.`);
  }

  const tipoLicencia = await resolveTipoLicencia(examId);

  const payload: CertificationPayload = {
    cedula: (profile.cedula as string | null) ?? '',
    nombre: (profile.full_name as string | null) ?? '',
    email: (profile.email as string | null) ?? '',
    tipoLicencia,
    resultado: 'aprobado',
    fecha: new Date().toISOString(),
  };

  // Trama cifrada extremo a extremo con Vault Transit (KMS).
  const ciphertext = await encryptWithTransit(JSON.stringify(payload));
  // Evidencia de la trama en tránsito: solo el ciphertext (la PII nunca en claro).
  console.log(
    `[certification] Trama cifrada con Vault Transit → POST ${config.campusride.apiUrl}/api/certifications ` +
      `ciphertext=${ciphertext.slice(0, 60)}… (${ciphertext.length} chars)`,
  );
  const token = await getServiceToken();

  const res = await fetch(`${config.campusride.apiUrl}/api/certifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ciphertext }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `CampusRide respondió ${res.status} al registrar la certificación (score ${score}): ${body || res.statusText}`,
    );
  }
}
