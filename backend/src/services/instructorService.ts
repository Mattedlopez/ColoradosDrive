import { supabaseAdmin } from '../config/supabase';

export interface InstructorRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listInstructors(activeOnly = false) {
  let query = supabaseAdmin
    .from('instructors')
    .select('id, full_name, email, phone, is_active, created_at, updated_at')
    .order('full_name');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as InstructorRow[];
}

export async function getInstructor(id: string) {
  const { data, error } = await supabaseAdmin
    .from('instructors')
    .select('id, full_name, email, phone, is_active, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as InstructorRow;
}

export async function createInstructor(params: {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  password?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from('instructors')
    .insert({
      full_name: params.fullName,
      email: params.email?.trim() || null,
      phone: params.phone?.trim() || null,
      is_active: params.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const instructor = data as InstructorRow;

  const email = params.email?.trim();
  const password = params.password?.trim();
  if (email && password && password.length >= 6) {
    const { createInstructorWithLogin } = await import('./authService');
    const result = await createInstructorWithLogin({
      instructorId: instructor.id,
      email,
      password,
      fullName: params.fullName,
    });
    if (result.error) throw new Error(result.error);
  }

  return instructor;
}

export async function updateInstructor(
  id: string,
  params: { fullName?: string; email?: string | null; phone?: string | null; isActive?: boolean; password?: string | null }
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.fullName !== undefined) update.full_name = params.fullName;
  if (params.email !== undefined) update.email = params.email?.trim() || null;
  if (params.phone !== undefined) update.phone = params.phone?.trim() || null;
  if (params.isActive !== undefined) update.is_active = params.isActive;

  const { data, error } = await supabaseAdmin
    .from('instructors')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (params.password !== undefined && params.password && params.password.trim().length >= 6) {
    const { updateInstructorPassword } = await import('./authService');
    const result = await updateInstructorPassword(id, params.password.trim());
    if (result.error) throw new Error(result.error);
  }

  return data as InstructorRow;
}

export async function deleteInstructor(id: string) {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('instructor_id', id)
    .eq('role', 'instructor')
    .maybeSingle();

  if (profile) {
    const { deleteUser } = await import('./userService');
    await deleteUser((profile as { id: string }).id);
  }

  const { error } = await supabaseAdmin.from('instructors').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
