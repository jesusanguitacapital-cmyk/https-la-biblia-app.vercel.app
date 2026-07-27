import type { AppData } from '../types'
import { supabase } from './supabase'

const TABLE_NAME = 'app_data_snapshots'

export const loadUserAppData = async (userId: string): Promise<AppData | null> => {
  if (!supabase) return null

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data?.data as AppData | undefined) ?? null
}

export const saveUserAppData = async (userId: string, appData: AppData) => {
  if (!supabase) return

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      user_id: userId,
      data: appData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
}
