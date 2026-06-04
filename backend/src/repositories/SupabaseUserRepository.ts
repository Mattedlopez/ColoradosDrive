import { supabaseAdmin } from '../config/supabase';
import { IUserRepository, UserProfileRow } from './interfaces/IUserRepository';

/**
 * Concrete implementation of IUserRepository backed by Supabase.
 * All direct SDK calls are isolated here; services depend only on IUserRepository.
 */
export class SupabaseUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserProfileRow | null> {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();
    return (data as UserProfileRow | null) ?? null;
  }

  async findScheduleId(userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('schedule_id')
      .eq('id', userId)
      .single();
    return (data as { schedule_id?: string | null } | null)?.schedule_id ?? null;
  }

  async findByScheduleId(scheduleId: string): Promise<Array<{ id: string }>> {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('schedule_id', scheduleId)
      .limit(1);
    return (data as Array<{ id: string }>) ?? [];
  }

  async insertProfile(data: Record<string, unknown>): Promise<{ error?: string }> {
    const { error } = await supabaseAdmin.from('user_profiles').insert(data);
    return error ? { error: error.message } : {};
  }

  async updateProfile(id: string, data: Record<string, unknown>): Promise<{ error?: string }> {
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update(data)
      .eq('id', id);
    return error ? { error: error.message } : {};
  }

  async deleteProfile(id: string): Promise<{ error?: string }> {
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', id);
    return error ? { error: error.message } : {};
  }

  async deleteScheduleOverrides(userId: string): Promise<void> {
    await supabaseAdmin
      .from('user_schedule_day_override')
      .delete()
      .eq('user_id', userId);
  }
}

/** Singleton instance used by services. Swap for a mock in tests. */
export const userRepository = new SupabaseUserRepository();
