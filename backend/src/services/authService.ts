/**
 * authService — Supabase session management only.
 *
 * Single responsibility: anything that touches Supabase Auth tokens or
 * the auth.users table. User profile CRUD lives in userService.
 */

import { supabaseAdmin, supabaseAnon } from '../config/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    courseId: string | null;
    instructorId?: string | null;
  };
}

// ─── login ───────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<LoginResult | null> {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, full_name, role, course_id, cohort_id, instructor_id, cohorts(course_id)')
    .eq('id', data.user.id)
    .single();

  if (profileError) throw new Error(`Perfil: ${profileError.message}`);
  if (!profile) return null;

  const courseId =
    profile.course_id ??
    (profile.cohorts as { course_id?: string } | null)?.course_id ??
    null;

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name || '',
      role: profile.role,
      courseId,
      instructorId: (profile as { instructor_id?: string | null }).instructor_id ?? null,
    },
  };
}

// ─── createInstructorWithLogin ───────────────────────────────────────────────

export async function createInstructorWithLogin(params: {
  instructorId: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<{ userId: string; error?: string }> {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  });

  if (authError || !authData.user) {
    return { userId: '', error: authError?.message || 'Error al crear usuario' };
  }

  const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
    id: authData.user.id,
    email: params.email,
    full_name: params.fullName,
    role: 'instructor',
    instructor_id: params.instructorId,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { userId: '', error: profileError.message };
  }

  return { userId: authData.user.id };
}

// ─── updateInstructorPassword ────────────────────────────────────────────────

export async function updateInstructorPassword(
  instructorId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('role', 'instructor')
    .maybeSingle();

  if (!profile) return { error: 'No existe cuenta de acceso para este instructor' };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    (profile as { id: string }).id,
    { password: newPassword },
  );
  if (error) return { error: error.message };
  return {};
}
