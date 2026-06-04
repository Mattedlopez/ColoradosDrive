/**
 * userService — user lifecycle management (create / update / delete).
 *
 * Extracted from authService to satisfy SRP:
 *   - authService  → authentication tokens, Supabase session management
 *   - userService  → user_profiles CRUD, cohort/schedule wiring, payments
 *
 * Uses userRepository (IUserRepository) for all DB writes, making this
 * service fully unit-testable by swapping the repository mock.
 */

import { supabaseAdmin } from '../config/supabase';
import { userRepository } from '../repositories/SupabaseUserRepository';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateUserParams {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'student';
  courseId?: string | null;
  cohortId?: string | null;
  courseNumber?: string | null;
  cedula?: string | null;
  scheduleId?: string | null;
  instructorId?: string | null;
  dayOfWeek?: number | null;
  startTime?: string | null;
  scheduleType?: 'weekdays' | 'weekends' | null;
  practiceWeeks?: 1 | 2 | 3 | null;
  practiceHoursPerDay?: number;
  practiceStartDate?: string | null;
  practiceEndDate?: string | null;
  gender?: string | null;
  citizenship?: string | null;
  bloodType?: string | null;
  birthDate?: string | null;
  address?: string | null;
  phone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  modality?: string | null;
  initialPaymentAmount?: number | null;
  discountApplied?: number | null;
  discountNote?: string | null;
  createdBy?: string | null;
  mustChangePassword?: boolean;
}

export interface UpdateUserParams {
  fullName?: string;
  role?: 'admin' | 'student';
  courseId?: string | null;
  cohortId?: string | null;
  courseNumber?: string | null;
  cedula?: string | null;
  scheduleId?: string | null;
  instructorId?: string | null;
  dayOfWeek?: number | null;
  startTime?: string | null;
  scheduleType?: 'weekdays' | 'weekends' | null;
  practiceWeeks?: 1 | 2 | 3 | null;
  practiceHoursPerDay?: number | null;
  citizenship?: string | null;
  bloodType?: string | null;
  birthDate?: string | null;
  address?: string | null;
  phone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  modality?: string | null;
  practiceStartDate?: string | null;
  practiceEndDate?: string | null;
  gender?: string | null;
  password?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveCohort(cohortId: string) {
  const { data: cohort } = await supabaseAdmin
    .from('cohorts')
    .select('course_id, start_date, end_date')
    .eq('id', cohortId)
    .single();
  return cohort as { course_id: string; start_date: string | null; end_date: string | null } | null;
}

function toDateString(v: unknown): string | null {
  return v ? String(v).slice(0, 10) : null;
}

function clampHours(n: number | null | undefined): number {
  return Math.min(4, Math.max(1, n ?? 1));
}

// ─── createUser ──────────────────────────────────────────────────────────────

export async function createUser(params: CreateUserParams): Promise<{ userId: string; error?: string }> {
  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: params.fullName },
  });

  if (authError || !authData.user) {
    return { userId: '', error: authError?.message || 'Failed to create user' };
  }

  const authUserId = authData.user.id;

  // 2. Resolve cohort / course
  let courseId: string | null = null;
  let cohortId: string | null = null;
  let cohortStartDate: string | null = null;
  let cohortEndDate: string | null = null;

  if (params.role === 'student') {
    if (params.cohortId) {
      cohortId = params.cohortId;
      const cohort = await resolveCohort(params.cohortId);
      courseId = cohort?.course_id ?? null;
      cohortStartDate = toDateString(cohort?.start_date);
      cohortEndDate = toDateString(cohort?.end_date);
    } else if (params.courseId && params.courseNumber) {
      const { getOrCreateCohort } = await import('./adminService');
      const cohort = await getOrCreateCohort(params.courseId, params.courseNumber);
      cohortId = cohort.id;
      courseId = cohort.course_id;
      const cohortDates = await resolveCohort(cohort.id);
      cohortStartDate = toDateString(cohortDates?.start_date);
      cohortEndDate = toDateString(cohortDates?.end_date);
    } else {
      courseId = params.courseId ?? null;
    }
  }

  // 3. Resolve schedule slot
  let scheduleId: string | null = params.role === 'student' ? (params.scheduleId || null) : null;

  if (params.role === 'student' && cohortId && !scheduleId && params.instructorId && params.startTime) {
    const startTimeNorm = String(params.startTime).slice(0, 5);
    const hoursPerDay = clampHours(params.practiceHoursPerDay);

    if (params.scheduleType === 'weekdays' || params.scheduleType === 'weekends') {
      try {
        const { getOrCreateScheduleGroup, getAvailableStartTimes } = await import('./scheduleService');
        const available = await getAvailableStartTimes(cohortId, params.instructorId, params.scheduleType, hoursPerDay, null);
        if (!available.some((s) => s.start_time === startTimeNorm)) {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
          return { userId: '', error: 'El horario seleccionado no está disponible. Elige otra hora o duración.' };
        }
        const { firstSlotId } = await getOrCreateScheduleGroup({
          cohortId,
          instructorId: params.instructorId,
          type: params.scheduleType,
          startTime: startTimeNorm,
          hoursPerDay,
        });
        scheduleId = firstSlotId;
      } catch {
        const { getOrCreateCourseSchedule } = await import('./scheduleService');
        const firstDay = params.scheduleType === 'weekends' ? 6 : 1;
        const schedule = await getOrCreateCourseSchedule({
          cohortId,
          instructorId: params.instructorId,
          dayOfWeek: firstDay,
          startTime: startTimeNorm,
        });
        scheduleId = schedule.id;
      }
    } else if (params.dayOfWeek != null && params.dayOfWeek >= 1 && params.dayOfWeek <= 7) {
      const { getOrCreateCourseSchedule } = await import('./scheduleService');
      const schedule = await getOrCreateCourseSchedule({
        cohortId,
        instructorId: params.instructorId,
        dayOfWeek: params.dayOfWeek,
        startTime: String(params.startTime).slice(0, 5),
      });
      scheduleId = schedule.id;
    }
  }

  // 4. Calculate payment amounts
  let totalAmount: number | null = null;
  let amountPaid = 0;
  let originalPrice: number | null = null;
  let discountApplied = 0;

  if (params.role === 'student' && courseId) {
    const { data: course } = await supabaseAdmin.from('courses').select('price').eq('id', courseId).single();
    const price = course?.price != null ? Number(course.price) : 0;
    originalPrice = price;
    discountApplied = Math.min(Math.max(0, Number(params.discountApplied ?? 0)), price);
    totalAmount = Math.max(0, price - discountApplied);
    const initial = Number(params.initialPaymentAmount ?? 0);
    if (initial > 0 && totalAmount > 0) {
      amountPaid = Math.min(initial, totalAmount);
    }
  }

  // 5. Resolve practice dates
  const practiceWeeksVal = (params.role === 'student' && [1, 2, 3].includes(params.practiceWeeks as number))
    ? params.practiceWeeks as 1 | 2 | 3
    : null;
  let practiceStartDate = params.practiceStartDate?.trim() || null;
  let practiceEndDate = params.practiceEndDate?.trim() || null;
  if (params.role === 'student' && !practiceStartDate && params.startDate?.trim()) {
    practiceStartDate = params.startDate.trim();
  }
  if (params.role === 'student' && !practiceEndDate && practiceStartDate && practiceWeeksVal) {
    const d = new Date(practiceStartDate);
    d.setDate(d.getDate() + practiceWeeksVal * 7 - 1);
    practiceEndDate = d.toISOString().slice(0, 10);
  }

  // 6. Build profile row
  const hoursPerDayVal = params.role === 'student'
    ? clampHours(params.practiceHoursPerDay)
    : 1;

  const profileRow: Record<string, unknown> = {
    id: authUserId,
    email: params.email,
    full_name: params.fullName,
    role: params.role,
    course_id: courseId,
    cohort_id: cohortId,
    cedula: params.cedula?.trim() || null,
    schedule_id: scheduleId,
    gender: params.gender === 'masculino' || params.gender === 'femenino' ? params.gender : null,
    citizenship: params.citizenship?.trim() || null,
    blood_type: params.bloodType?.trim() || null,
    birth_date: params.birthDate?.trim() || null,
    address: params.address?.trim() || null,
    phone: params.phone?.trim() || null,
    start_date: params.startDate?.trim() || cohortStartDate || null,
    end_date: params.endDate?.trim() || cohortEndDate || null,
    modality: params.modality?.trim() || null,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    must_change_password: params.mustChangePassword ?? true,
  };

  if (params.role === 'student') {
    if (originalPrice != null) profileRow.original_price = originalPrice;
    profileRow.discount_applied = discountApplied;
    if (discountApplied > 0 && params.discountNote?.trim()) profileRow.discount_note = params.discountNote.trim();
    if (practiceWeeksVal != null) profileRow.practice_weeks = practiceWeeksVal;
    profileRow.practice_hours_per_day = hoursPerDayVal;
    if (practiceStartDate) profileRow.practice_start_date = practiceStartDate;
    if (practiceEndDate) profileRow.practice_end_date = practiceEndDate;
  }

  // 7. Insert profile (with graceful column-missing fallback)
  let insertResult = await userRepository.insertProfile(profileRow);
  if (insertResult.error) {
    if (/practice_weeks|practice_start_date|practice_end_date|gender|practice_hours_per_day|column.*does not exist/i.test(insertResult.error)) {
      const fallback = { ...profileRow };
      delete fallback.practice_weeks;
      delete fallback.practice_start_date;
      delete fallback.practice_end_date;
      delete fallback.gender;
      delete fallback.practice_hours_per_day;
      insertResult = await userRepository.insertProfile(fallback);
    }
    if (insertResult.error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return { userId: '', error: insertResult.error };
    }
  }

  // 8. Record initial payment
  if (params.role === 'student' && amountPaid > 0) {
    const note = discountApplied > 0
      ? `Pago inicial al inscribir (descuento aplicado: $${discountApplied.toFixed(2)})`
      : 'Pago inicial al inscribir';
    const paymentRow: Record<string, unknown> = {
      user_id: authUserId,
      amount: amountPaid,
      note,
      created_by: params.createdBy ?? null,
    };
    if (discountApplied > 0) paymentRow.discount_applied = discountApplied;
    await supabaseAdmin.from('payments').insert(paymentRow);
  }

  return { userId: authUserId };
}

// ─── deleteUser ──────────────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  await userRepository.deleteScheduleOverrides(userId);

  const profileResult = await userRepository.deleteProfile(userId);
  if (profileResult.error) return profileResult;

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  return {};
}

// ─── updateUserProfile ───────────────────────────────────────────────────────

export async function updateUserProfile(
  userId: string,
  params: UpdateUserParams,
): Promise<{ error?: string }> {
  // Update Supabase Auth metadata / password
  if (params.password !== undefined) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: params.password,
      ...(params.fullName !== undefined && { user_metadata: { full_name: params.fullName } }),
    });
    if (error) return { error: error.message };
  } else if (params.fullName !== undefined) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name: params.fullName },
    });
    if (error) return { error: error.message };
  }

  const update: Record<string, unknown> = {};

  if (params.fullName !== undefined) update.full_name = params.fullName;

  if (params.role !== undefined) {
    update.role = params.role;
    if (params.role === 'admin') {
      update.course_id = null;
      update.cohort_id = null;
      update.schedule_id = null;
    } else if (params.role === 'student' && (params.courseId !== undefined || params.cohortId !== undefined)) {
      if (params.cohortId) {
        const cohort = await resolveCohort(params.cohortId);
        update.course_id = cohort?.course_id ?? null;
        update.cohort_id = params.cohortId;
        if (cohort && params.startDate === undefined && params.endDate === undefined) {
          update.start_date = toDateString(cohort.start_date);
          update.end_date = toDateString(cohort.end_date);
        }
      } else {
        update.course_id = params.courseId ?? null;
        update.cohort_id = null;
      }
    }
  }

  if (params.cedula !== undefined) update.cedula = params.cedula?.trim() || null;
  if (params.gender !== undefined) {
    update.gender = params.gender === 'masculino' || params.gender === 'femenino' ? params.gender : null;
  }
  if (params.scheduleId !== undefined) update.schedule_id = params.scheduleId ?? null;
  if (params.practiceWeeks !== undefined) {
    update.practice_weeks = [1, 2, 3].includes(params.practiceWeeks as number) ? params.practiceWeeks : null;
  }
  if (params.practiceHoursPerDay !== undefined) {
    update.practice_hours_per_day = params.practiceHoursPerDay != null ? clampHours(params.practiceHoursPerDay) : 1;
  }

  // Schedule reassignment — track old slot separately (no internal property hack)
  let oldScheduleIdForCleanup: string | null = null;

  if (params.instructorId != null && params.startTime && params.cohortId) {
    const cohortId = params.cohortId;
    const startTime = String(params.startTime).slice(0, 5);
    const hoursPerDay = clampHours(params.practiceHoursPerDay ?? 1);
    const currentScheduleId = await userRepository.findScheduleId(userId);

    if (params.scheduleType === 'weekdays' || params.scheduleType === 'weekends') {
      const { getOrCreateScheduleGroup, getAvailableStartTimes } = await import('./scheduleService');
      const available = await getAvailableStartTimes(cohortId, params.instructorId, params.scheduleType, hoursPerDay, currentScheduleId);
      if (!available.some((s) => s.start_time === startTime)) {
        return { error: 'El horario seleccionado no está disponible. Elige otra hora o duración.' };
      }
      const { firstSlotId } = await getOrCreateScheduleGroup({
        cohortId,
        instructorId: params.instructorId,
        type: params.scheduleType,
        startTime,
        hoursPerDay,
      });
      update.schedule_id = firstSlotId;
      oldScheduleIdForCleanup = currentScheduleId;
      await userRepository.deleteScheduleOverrides(userId);
    } else if (params.dayOfWeek != null) {
      const { getOrCreateCourseSchedule, getAvailableSlots } = await import('./scheduleService');
      const available = await getAvailableSlots(cohortId, params.instructorId, currentScheduleId);
      const slotKey = `${params.dayOfWeek}-${startTime}`;
      const isAvailable = available.some((s) => {
        const t = typeof s.start_time === 'string' ? s.start_time.slice(0, 5) : s.start_time;
        return `${s.day_of_week}-${t}` === slotKey;
      });
      if (!isAvailable) return { error: 'Ese horario no está disponible. Elige otro día, hora o instructor.' };
      const schedule = await getOrCreateCourseSchedule({
        cohortId,
        instructorId: params.instructorId,
        dayOfWeek: params.dayOfWeek,
        startTime,
      });
      update.schedule_id = schedule.id;
      oldScheduleIdForCleanup = currentScheduleId;
    }
  }

  if (params.citizenship !== undefined) update.citizenship = params.citizenship?.trim() || null;
  if (params.bloodType !== undefined) update.blood_type = params.bloodType?.trim() || null;
  if (params.birthDate !== undefined) update.birth_date = params.birthDate?.trim() || null;
  if (params.address !== undefined) update.address = params.address?.trim() || null;
  if (params.phone !== undefined) update.phone = params.phone?.trim() || null;
  if (params.startDate !== undefined) update.start_date = params.startDate?.trim() || null;
  if (params.endDate !== undefined) update.end_date = params.endDate?.trim() || null;
  if (params.modality !== undefined) update.modality = params.modality?.trim() || null;
  if (params.practiceStartDate !== undefined) update.practice_start_date = params.practiceStartDate?.trim() || null;
  if (params.practiceEndDate !== undefined) update.practice_end_date = params.practiceEndDate?.trim() || null;

  // Cohort / course (when not already handled by role change)
  if (params.courseId !== undefined || params.cohortId !== undefined || params.courseNumber !== undefined) {
    if (params.cohortId) {
      const cohort = await resolveCohort(params.cohortId);
      update.course_id = cohort?.course_id ?? null;
      update.cohort_id = params.cohortId;
      if (cohort && params.startDate === undefined && params.endDate === undefined) {
        update.start_date = toDateString(cohort.start_date);
        update.end_date = toDateString(cohort.end_date);
      }
    } else if (params.courseId && params.courseNumber && String(params.courseNumber).trim()) {
      const { getOrCreateCohort } = await import('./adminService');
      const cohort = await getOrCreateCohort(params.courseId, String(params.courseNumber).trim());
      update.course_id = cohort.course_id;
      update.cohort_id = cohort.id;
      const cohortDates = await resolveCohort(cohort.id);
      if (cohortDates && params.startDate === undefined && params.endDate === undefined) {
        update.start_date = toDateString(cohortDates.start_date);
        update.end_date = toDateString(cohortDates.end_date);
      }
    } else {
      update.course_id = params.courseId ?? null;
      update.cohort_id = null;
      update.schedule_id = null;
    }
  }

  if (Object.keys(update).length > 0) {
    const result = await userRepository.updateProfile(userId, update);
    if (result.error) return result;
  }

  // Clean up orphaned schedule slot after reassignment
  if (oldScheduleIdForCleanup) {
    const remaining = await userRepository.findByScheduleId(oldScheduleIdForCleanup);
    if (!remaining.length) {
      await supabaseAdmin.from('course_schedules').delete().eq('id', oldScheduleIdForCleanup);
    }
  }

  return {};
}
