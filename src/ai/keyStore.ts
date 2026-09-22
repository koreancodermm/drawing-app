import { useSyncExternalStore } from 'react'
import { AI_FEATURE_ENABLED, STORAGE_KEYS } from './config'

// API 키와 동의 기록은 이 기기의 localStorage에만 둔다. 로그에 찍거나 다른 곳으로 보내지 않는다.

const listeners = new Set<() => void>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 저장소를 쓸 수 없으면(사생활 보호 모드 등) 조용히 무시한다. 키가 없는 것으로 보인다.
  }
  listeners.forEach((l) => l())
}

export function getApiKey(): string | null {
  const key = read(STORAGE_KEYS.apiKey)?.trim()
  return key ? key : null
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  write(STORAGE_KEYS.apiKey, trimmed ? trimmed : null)
}

export function clearApiKey(): void {
  write(STORAGE_KEYS.apiKey, null)
}

export function hasConsent(): boolean {
  return read(STORAGE_KEYS.consent) === 'yes'
}

export function giveConsent(): void {
  write(STORAGE_KEYS.consent, 'yes')
}

export function revokeConsent(): void {
  write(STORAGE_KEYS.consent, null)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEYS.apiKey || e.key === STORAGE_KEYS.consent) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** 기능이 켜져 있고 키가 들어 있으면 true. 키가 바뀌면 화면이 다시 그려진다. */
export function useAiReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => AI_FEATURE_ENABLED && getApiKey() !== null,
    () => false,
  )
}

export function useHasApiKey(): boolean {
  return useSyncExternalStore(subscribe, () => getApiKey() !== null, () => false)
}
