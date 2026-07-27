import type { AppData } from './types'
declare global {
  interface Window {
    tradingApp: {
      getDefaultFolder: () => Promise<string>
      selectFolder: () => Promise<string | null>
      loadData: () => Promise<{ folder: string; data: AppData | null }>
      saveData: (payload: { folder: string | null; data: AppData }) => Promise<{ folder: string }>
      copyImage: (payload: { imagePath: string; folder: string | null }) => Promise<{ path: string }>
      selectImage: () => Promise<string | null>
      extractOperationFromImage: (payload: { imagePath: string }) => Promise<Record<string, unknown>>
    }
  }
}

export {}
