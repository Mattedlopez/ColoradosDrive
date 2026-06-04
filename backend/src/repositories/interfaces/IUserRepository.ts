/**
 * Repository interface for user_profiles table.
 * Depends on this abstraction — not on the Supabase SDK directly (DIP).
 * Swap the implementation (e.g. for tests) without touching service code.
 */

export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'student' | 'instructor';
  course_id: string | null;
  cohort_id: string | null;
  instructor_id: string | null;
  schedule_id: string | null;
  cedula: string | null;
  gender: 'masculino' | 'femenino' | null;
  citizenship: string | null;
  blood_type: string | null;
  birth_date: string | null;
  address: string | null;
  phone: string | null;
  start_date: string | null;
  end_date: string | null;
  modality: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  practice_weeks: 1 | 2 | 3 | null;
  practice_hours_per_day: number | null;
  practice_start_date: string | null;
  practice_end_date: string | null;
  must_change_password: boolean;
}

export interface IUserRepository {
  /** Returns the profile row or null if not found. */
  findById(id: string): Promise<UserProfileRow | null>;

  /** Returns the schedule_id for a given user (used for cleanup checks). */
  findScheduleId(userId: string): Promise<string | null>;

  /** Returns ids of all users assigned to a schedule slot. */
  findByScheduleId(scheduleId: string): Promise<Array<{ id: string }>>;

  /** Inserts a new profile row. */
  insertProfile(data: Record<string, unknown>): Promise<{ error?: string }>;

  /** Applies a partial update to an existing profile row. */
  updateProfile(id: string, data: Record<string, unknown>): Promise<{ error?: string }>;

  /** Deletes the profile row by user id. */
  deleteProfile(id: string): Promise<{ error?: string }>;

  /** Removes all per-day schedule overrides for a user. */
  deleteScheduleOverrides(userId: string): Promise<void>;
}
