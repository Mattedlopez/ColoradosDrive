import { supabaseAdmin } from '../config/supabase';
import { deleteUser as deleteAuthUser } from '../services/userService';

export async function createSubject(courseId: string, name: string, orderIndex = 0) {
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .insert({ course_id: courseId, name, order_index: orderIndex })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSubject(id: string) {
  const { error } = await supabaseAdmin.from('subjects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteContent(id: string) {
  const { error } = await supabaseAdmin.from('contents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createContent(
  subjectId: string,
  params: { title: string; body?: string; externalLink?: string; fileUrl?: string; orderIndex?: number }
) {
  const { data, error } = await supabaseAdmin
    .from('contents')
    .insert({
      subject_id: subjectId,
      title: params.title,
      body: params.body || null,
      external_link: params.externalLink || null,
      file_url: params.fileUrl || null,
      order_index: params.orderIndex ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const EXTRA_PROFILE_COLUMNS = 'birth_date, address, phone, start_date, end_date, modality, practice_weeks, practice_start_date, practice_end_date, practice_hours_per_day';
const isExtraColumnsError = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  return /birth_date|address|phone|start_date|end_date|modality|practice_start_date|practice_end_date|gender|schema|does not exist/i.test(msg);
};

const BASE_SELECT_MINIMAL = 'id, email, full_name, role, course_id, cohort_id, cedula, citizenship, blood_type, schedule_id, total_amount, amount_paid, original_price, discount_applied, discount_note, created_at, courses(name, code), cohorts(id, name, code, course_id)';

export async function listUsers(filters?: { courseId?: string; cohortId?: string; role?: string; search?: string }) {
  const baseSelect = 'id, email, full_name, role, course_id, cohort_id, cedula, gender, citizenship, blood_type, schedule_id, total_amount, amount_paid, original_price, discount_applied, discount_note, created_at, courses(name, code), cohorts(id, name, code, course_id)';
  let query = supabaseAdmin
    .from('user_profiles')
    .select(`${baseSelect}, ${EXTRA_PROFILE_COLUMNS}`);

  if (filters?.cohortId) {
    query = query.eq('cohort_id', filters.cohortId);
  } else if (filters?.courseId) {
    const { data: cohortIds } = await supabaseAdmin.from('cohorts').select('id').eq('course_id', filters.courseId);
    const ids = (cohortIds || []).map((c) => c.id);
    if (ids.length > 0) {
      query = query.or(`course_id.eq.${filters.courseId},cohort_id.in.(${ids.join(',')})`);
    } else {
      query = query.eq('course_id', filters.courseId);
    }
  }
  if (filters?.role) {
    query = query.eq('role', filters.role);
  }
  if (filters?.search && filters.search.trim()) {
    const term = filters.search.trim();
    const pattern = `%${term}%`;
    query = query.or(`cedula.ilike.${pattern},full_name.ilike.${pattern},email.ilike.${pattern}`);
  }

  let result = await query.order('created_at', { ascending: false });
  let rows: Record<string, unknown>[] = [];
  if (result.error && isExtraColumnsError(result.error)) {
    let fallback = supabaseAdmin.from('user_profiles').select(`${BASE_SELECT_MINIMAL}, ${EXTRA_PROFILE_COLUMNS}`);
    if (filters?.cohortId) fallback = fallback.eq('cohort_id', filters.cohortId);
    else if (filters?.courseId) {
      const { data: cohortIds } = await supabaseAdmin.from('cohorts').select('id').eq('course_id', filters.courseId);
      const ids = (cohortIds || []).map((c) => c.id);
      if (ids.length > 0) fallback = fallback.or(`course_id.eq.${filters.courseId},cohort_id.in.(${ids.join(',')})`);
      else fallback = fallback.eq('course_id', filters.courseId);
    }
    if (filters?.role) fallback = fallback.eq('role', filters.role);
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.trim();
      const pattern = `%${term}%`;
      fallback = fallback.or(`cedula.ilike.${pattern},full_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const fallbackResult = await fallback.order('created_at', { ascending: false });
    if (fallbackResult.error) throw new Error(fallbackResult.error.message);
    rows = fallbackResult.data || [];
  } else {
    if (result.error) throw new Error(result.error.message);
    rows = result.data || [];
  }
  const users = rows.map((u) => ({
    ...u,
    birth_date: (u as Record<string, unknown>).birth_date ?? null,
    address: (u as Record<string, unknown>).address ?? null,
    phone: (u as Record<string, unknown>).phone ?? null,
    start_date: (u as Record<string, unknown>).start_date ?? null,
    end_date: (u as Record<string, unknown>).end_date ?? null,
    modality: (u as Record<string, unknown>).modality ?? null,
    practice_weeks: (u as Record<string, unknown>).practice_weeks ?? null,
    practice_start_date: (u as Record<string, unknown>).practice_start_date ?? null,
    practice_end_date: (u as Record<string, unknown>).practice_end_date ?? null,
  }));
  if (!users.length) return [];

  const scheduleIds = [...new Set((users as { schedule_id?: string }[]).map((u) => u.schedule_id).filter(Boolean) as string[])];
  if (scheduleIds.length === 0) return users;

  let scheduleRows: { id: string; day_of_week: number; start_time: string; schedule_group_id?: string | null; instructors?: unknown }[] = [];
  const sResult = await supabaseAdmin
    .from('course_schedules')
    .select('id, day_of_week, start_time, schedule_group_id, instructors(id, full_name, email)')
    .in('id', scheduleIds);
  if (sResult.error && /schedule_group_id|schedule_groups|does not exist/i.test(sResult.error.message)) {
    const fallback = await supabaseAdmin.from('course_schedules').select('id, day_of_week, start_time, instructors(id, full_name, email)').in('id', scheduleIds);
    if (!fallback.error) scheduleRows = (fallback.data || []).map((r) => ({ ...r, schedule_group_id: null }));
  } else {
    if (sResult.error) throw new Error(sResult.error.message);
    scheduleRows = sResult.data || [];
  }

  const groupIds = [...new Set(scheduleRows.map((s) => s.schedule_group_id).filter(Boolean))] as string[];
  let groupMap = new Map<string, { type: string; start_time: string }>();
  if (groupIds.length > 0) {
    try {
      const { data: groups } = await supabaseAdmin.from('schedule_groups').select('id, type, start_time').in('id', groupIds);
      for (const g of groups || []) {
        const id = (g as { id: string }).id;
        const type = (g as { type: string }).type;
        const start_time = typeof (g as { start_time?: string }).start_time === 'string' ? (g as { start_time: string }).start_time.slice(0, 5) : '';
        groupMap.set(id, { type, start_time });
      }
    } catch {
      // schedule_groups table puede no existir si no se ejecutó la migración 014
    }
  }

  const scheduleGroupLabel = (type: string, startTime: string) =>
    type === 'weekdays' ? `Lunes a Viernes ${startTime}` : type === 'weekends' ? `Sábado y Domingo ${startTime}` : '';

  const scheduleMap = new Map(
    scheduleRows.map((s) => {
      const raw = s as { instructors?: { full_name: string; email: string | null } | Array<{ full_name: string; email: string | null }>; schedule_group_id?: string | null };
      const instr = raw.instructors;
      const single = Array.isArray(instr) ? (instr[0] ?? null) : instr ?? null;
      const startTime = typeof s.start_time === 'string' ? (s.start_time as string).slice(0, 5) : s.start_time;
      const group = raw.schedule_group_id ? groupMap.get(raw.schedule_group_id) : null;
      const label = group ? scheduleGroupLabel(group.type, group.start_time) : `Día ${(s as { day_of_week: number }).day_of_week} ${startTime}`;
      return [
        s.id,
        {
          id: s.id,
          day_of_week: s.day_of_week,
          start_time: startTime,
          schedule_group_id: raw.schedule_group_id ?? null,
          schedule_label: label,
          instructors: single,
        },
      ];
    })
  );

  return (users as Record<string, unknown>[]).map((u) => ({
    ...u,
    course_schedules: u.schedule_id ? scheduleMap.get(u.schedule_id as string) ?? null : null,
  }));
}

function isPriceColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /price|schema\s*cache|does not exist/i.test(msg);
}

export async function createCourse(name: string, code: string, price = 0) {
  let result = await supabaseAdmin
    .from('courses')
    .insert({ name, code, price: Number(price) })
    .select()
    .single();
  if (result.error && isPriceColumnError(result.error)) {
    result = await supabaseAdmin
      .from('courses')
      .insert({ name, code })
      .select()
      .single();
  }
  if (result.error) throw new Error(result.error.message);
  const data = result.data as Record<string, unknown>;
  return { ...data, price: data?.price ?? price } as typeof result.data;
}

export async function updateCourse(id: string, params: { name?: string; code?: string; price?: number }) {
  const update: Record<string, unknown> = {};
  if (params.name !== undefined) update.name = params.name;
  if (params.code !== undefined) update.code = params.code;
  if (params.price !== undefined) update.price = Number(params.price);
  if (Object.keys(update).length === 0) return null;
  let result = await supabaseAdmin.from('courses').update(update).eq('id', id).select().single();
  if (result.error && isPriceColumnError(result.error) && params.price !== undefined) {
    const { price: _p, ...rest } = update;
    if (Object.keys(rest).length > 0) {
      result = await supabaseAdmin.from('courses').update(rest).eq('id', id).select().single();
    }
  }
  if (result.error) throw new Error(result.error.message);
  const data = result.data as Record<string, unknown>;
  if (result.data && params.price !== undefined) (data as Record<string, unknown>).price = params.price;
  return result.data;
}

export async function deleteCourse(id: string) {
  const { error } = await supabaseAdmin.from('courses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listCourses(): Promise<{ id: string; name: string; code: string; price: number }[]> {
  const result = await supabaseAdmin.from('courses').select('id, name, code, price').order('name');
  if (result.error && isPriceColumnError(result.error)) {
    const fallbackResult = await supabaseAdmin.from('courses').select('id, name, code').order('name');
    if (fallbackResult.error) throw new Error(fallbackResult.error.message);
    return (fallbackResult.data || []).map((row: Record<string, unknown>) => ({ ...row, price: 0 })) as { id: string; name: string; code: string; price: number }[];
  }
  if (result.error) throw new Error(result.error.message);
  return (result.data || []) as { id: string; name: string; code: string; price: number }[];
}

export async function listSubjects(courseId?: string) {
  let query = supabaseAdmin
    .from('subjects')
    .select('id, name, order_index, course_id, courses(name, code)')
    .order('order_index');

  if (courseId) {
    query = query.eq('course_id', courseId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function listContentsBySubject(subjectId: string) {
  const { data, error } = await supabaseAdmin
    .from('contents')
    .select('id, title, body, external_link, file_url, order_index')
    .eq('subject_id', subjectId)
    .order('order_index');
  if (error) throw new Error(error.message);
  return data;
}

// Cohorts (Curso Tipo A/B + Número, ej: Curso Tipo B Nro 200)
export async function getOrCreateCohort(courseId: string, number: string) {
  const code = String(number).trim();
  if (!code) throw new Error('Número de curso requerido');
  const { data: existing } = await supabaseAdmin
    .from('cohorts')
    .select('id, name, code, course_id')
    .eq('course_id', courseId)
    .eq('code', code)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .insert({ course_id: courseId, name: code, code })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCohort(courseId: string, name: string, code: string, startDate?: string | null, endDate?: string | null) {
  const insert: Record<string, unknown> = { course_id: courseId, name, code };
  if (startDate?.trim()) insert.start_date = startDate.trim().slice(0, 10);
  if (endDate?.trim()) insert.end_date = endDate.trim().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .insert(insert)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listCohorts(courseId?: string) {
  let query = supabaseAdmin
    .from('cohorts')
    .select('id, name, code, course_id, start_date, end_date, created_at, courses(name, code)')
    .order('created_at', { ascending: false });

  if (courseId) {
    query = query.eq('course_id', courseId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCohort(id: string) {
  const { error } = await supabaseAdmin.from('cohorts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateCohort(
  id: string,
  params: { courseId: string; name: string; code: string; startDate?: string | null; endDate?: string | null }
) {
  const update: Record<string, unknown> = {
    course_id: params.courseId,
    name: params.name.trim(),
    code: params.code.trim(),
  };
  if (params.startDate !== undefined) update.start_date = params.startDate?.trim()?.slice(0, 10) || null;
  if (params.endDate !== undefined) update.end_date = params.endDate?.trim()?.slice(0, 10) || null;
  const { data, error } = await supabaseAdmin
    .from('cohorts')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Elimina el cohort, todos los horarios (course_schedules) de ese curso y todos los usuarios
 * (estudiantes) asignados. Libera espacio: borra usuarios en Auth (y en cascada sus intentos,
 * respuestas, actividad). El admin debe haber descargado el CSV antes.
 */
export async function deleteCohortWithUsers(cohortId: string): Promise<{ deletedUsers: number }> {
  const { data: profiles, error: fetchError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role')
    .eq('cohort_id', cohortId);

  if (fetchError) throw new Error(fetchError.message);

  const studentIds = (profiles || []).filter((p) => p.role === 'student').map((p) => p.id);

  for (const userId of studentIds) {
    await deleteAuthUser(userId);
  }

  // Eliminar todos los horarios (slots) de este cohort antes de borrar el cohort
  const { error: schedulesError } = await supabaseAdmin
    .from('course_schedules')
    .delete()
    .eq('cohort_id', cohortId);
  if (schedulesError) throw new Error(schedulesError.message);

  await deleteCohort(cohortId);
  return { deletedUsers: studentIds.length };
}
