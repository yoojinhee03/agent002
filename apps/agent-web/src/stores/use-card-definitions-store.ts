/**
 * 카드 정의 캐시 store — Zustand 메모리 캐시 (페이지 세션 단위).
 *
 * 이전엔 localStorage 영구 캐시를 사용했지만, 빌더에서 카드 정의를 수정해도
 * 채팅 화면이 옛 layout 을 계속 보여주는 stale 문제가 발생 → 메모리 캐시만 유지하고
 * 페이지 새로고침 / 빌더 save 후 invalidate 로 fresh fetch 를 강제한다.
 *
 * invariant: `(cardId, version)` 으로 immutable 캐싱. 빌더가 같은 cardId 의 layout 을
 * 바꿔도 version 이 같으면 캐시 hit → save 후 반드시 `invalidate(cardId)` 호출 필요.
 */
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { apiClient } from '@/lib/api-client'
import type { CardDefinition } from '@/lib/api-client'

interface CardDefinitionsState {
  cache: Record<string, CardDefinition>
  inflight: Record<string, Promise<CardDefinition>>
  get: (cardId: string, version: number) => Promise<CardDefinition>
  /** 더 이상 사용하지 않음 (localStorage 캐시 제거). 호환을 위해 noop 유지. */
  hydrate: () => void
  invalidate: (cardId: string) => void
  /** 전체 캐시 비우기 — 시드 후 또는 명시적 새로고침. */
  clearAll: () => void
}

function keyOf(cardId: string, version: number): string {
  return `${cardId}@${version}`
}

export const useCardDefinitionsStore = create<CardDefinitionsState>()(
  immer((set, get) => ({
    cache: {},
    inflight: {},

    hydrate: () => {
      /* noop — localStorage 캐시 제거됨. 페이지 진입 시 메모리 캐시만 사용. */
    },

    invalidate: (cardId) => {
      set((state) => {
        for (const k of Object.keys(state.cache)) {
          if (k.startsWith(`${cardId}@`)) delete state.cache[k]
        }
        for (const k of Object.keys(state.inflight)) {
          if (k.startsWith(`${cardId}@`)) delete state.inflight[k]
        }
      })
    },

    clearAll: () => {
      set((state) => {
        state.cache = {}
        state.inflight = {}
      })
    },

    get: async (cardId, version) => {
      const k = keyOf(cardId, version)
      const cached = get().cache[k]
      if (cached) return cached
      const inflight = get().inflight[k]
      if (inflight) return inflight
      const promise = apiClient.cards
        .get(cardId, version)
        .then((card) => {
          set((state) => {
            state.cache[k] = card
            delete state.inflight[k]
          })
          return card
        })
        .catch((err) => {
          set((state) => {
            delete state.inflight[k]
          })
          throw err
        })
      set((state) => {
        state.inflight[k] = promise
      })
      return promise
    },
  })),
)

// 기존 localStorage 캐시가 남아 있다면 즉시 제거 — stale layout 노출 차단.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('card-definitions-cache:v1')
  } catch {
    /* ignore */
  }
}
