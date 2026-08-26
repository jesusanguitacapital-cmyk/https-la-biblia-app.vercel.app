import type { AppData } from '../types'
import { supabase } from './supabase'

const TABLE_NAME = 'app_data_snapshots'
const METADATA_KEY = 'la_biblia_app_data'
const METADATA_UPDATED_AT_KEY = 'la_biblia_app_data_updated_at'
const LOCAL_DEVICE_USER_ID = 'local-device-user'
const LOCAL_APP_DATA_KEY = 'trading-coach-data'

const shouldUseMetadataFallback = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string; status?: number }
  const message = maybeError.message?.toLowerCase() ?? ''

  return maybeError.code === 'PGRST205'
    || maybeError.code === '42P01'
    || maybeError.code === '42501'
    || maybeError.status === 401
    || maybeError.status === 403
    || message.includes('app_data_snapshots')
    || message.includes('schema cache')
    || message.includes('permission denied')
    || message.includes('row-level security')
}

const isLocalDeviceUser = (userId: string) => userId === LOCAL_DEVICE_USER_ID

const readLocalAppData = (): AppData | null => {
  try {
    const raw = window.localStorage.getItem(LOCAL_APP_DATA_KEY)
    return raw ? JSON.parse(raw) as AppData : null
  } catch {
    return null
  }
}

const writeLocalAppData = (appData: AppData) => {
  window.localStorage.setItem(LOCAL_APP_DATA_KEY, JSON.stringify(appData))
}

const loadFromUserMetadata = async (userId: string): Promise<AppData | null> => {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user || data.user.id !== userId) return null

  const snapshot = data.user.user_metadata?.[METADATA_KEY]
  return snapshot && typeof snapshot === 'object' ? snapshot as AppData : null
}

const saveToUserMetadata = async (appData: AppData) => {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      [METADATA_KEY]: appData,
      [METADATA_UPDATED_AT_KEY]: new Date().toISOString(),
    },
  })

  if (error) throw error
}

export const loadUserAppData = async (userId: string): Promise<AppData | null> => {
  if (isLocalDeviceUser(userId)) {
    return readLocalAppData()
  }

  if (!supabase) return null

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (shouldUseMetadataFallback(error)) {
      return loadFromUserMetadata(userId)
    }
    throw error
  }

  return (data?.data as AppData | undefined) ?? await loadFromUserMetadata(userId)
}

export const saveUserAppData = async (userId: string, appData: AppData) => {
  if (isLocalDeviceUser(userId)) {
    writeLocalAppData(appData)
    return
  }

  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      user_id: userId,
      data: appData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    if (shouldUseMetadataFallback(error)) {
      await saveToUserMetadata(appData)
      return
    }
    throw error
  }
}
