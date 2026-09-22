/** 브라우저가 저장 공간이 부족할 때 이 앱의 데이터를 마음대로 지우지 못하게 요청한다. */
export async function requestPersistence(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage) return false
    if (storage.persisted && (await storage.persisted())) return true
    if (storage.persist) return await storage.persist()
  } catch {
    // 지원하지 않거나 거절되면 그냥 넘어간다.
  }
  return false
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

export interface StorageEstimate {
  usage: number
  quota: number
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') {
      return null
    }
    return { usage: estimate.usage, quota: estimate.quota }
  } catch {
    return null
  }
}
