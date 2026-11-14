import { SEED_PASSPORT_DB } from './passport-seed'
import type { PassportDb } from './passport-types'

// 护照库与条目库分开存：条目走 data-layer-studio:entries，护照走自己的整库快照。
const STORAGE_KEY = 'data-layer-studio:catalog-passports'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): PassportDb {
  const fallback = clone(SEED_PASSPORT_DB)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as PassportDb
    return {
      passports: Array.isArray(parsed.passports) ? parsed.passports : fallback.passports,
      ledgers: Array.isArray(parsed.ledgers) ? parsed.ledgers : fallback.ledgers,
      seq: typeof parsed.seq === 'number' ? parsed.seq : fallback.seq,
    }
  } catch {
    // 存储被写坏时回到种子，不把坏数据带进事务
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: PassportDb | null = null

export function passportDb(): PassportDb {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

/** 整库快照落库：一次写入，保证护照与台账不会各写一半 */
export function commitDb(db: PassportDb): void {
  cache = db
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }
}

export function resetPassportDb(): PassportDb {
  const fresh = clone(SEED_PASSPORT_DB)
  commitDb(fresh)
  return fresh
}

export function passportStorageKey(): string {
  return STORAGE_KEY
}

/** 测试辅助：丢弃内存缓存，下次读取从 localStorage 重建，等价于刷新页面 */
export function __evictCacheForTest(): void {
  cache = null
}
