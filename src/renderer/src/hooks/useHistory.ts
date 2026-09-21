import { useEffect, useRef, useState } from 'react'

/** 이력 한 칸 최대 개수 */
const HISTORY_MAX = 100
/** 슬라이더 드래그·연속 타이핑을 이력 한 칸으로 묶는 침묵 시간(ms) */
const HISTORY_DEBOUNCE = 400

function same<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((k) => a[k] === b[k])
}

/**
 * undo/redo — 작업 상태 스냅샷(값은 전부 불변 참조)을 지켜보다가 잠잠해지면 직전 스냅샷을 쌓는다.
 * 자르기 드래그·슬라이더처럼 연속으로 바뀌는 조작이 이력 한 칸이 되도록 디바운스한다.
 * App 에서 분리(v1.4.0) — 이력 대상 필드가 늘어도 여기와 App 의 복원 콜백만 맞추면 된다.
 */
export function useHistory<T extends object>(snapshot: T, restore: (s: T) => void): { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } {
  const hist = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] })
  const committed = useRef<T>(snapshot) // 마지막으로 이력에 반영된 상태
  const restoring = useRef(false) // undo/redo로 인한 상태 변경은 이력에 다시 쌓지 않는다
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(snapshot)
  latest.current = snapshot
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })

  const sync = (): void =>
    setFlags((prev) => {
      const next = { canUndo: hist.current.past.length > 0, canRedo: hist.current.future.length > 0 }
      return prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next
    })

  /** 대기 중(디바운스)인 변경을 즉시 이력에 반영 */
  const flush = (): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!same(committed.current, latest.current)) {
      hist.current.past.push(committed.current)
      if (hist.current.past.length > HISTORY_MAX) hist.current.past.shift()
      hist.current.future = []
      committed.current = latest.current
      sync()
    }
  }

  useEffect(() => {
    if (restoring.current) {
      restoring.current = false
      committed.current = latest.current
      return
    }
    if (same(committed.current, latest.current)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, HISTORY_DEBOUNCE)
  }, Object.values(snapshot)) // eslint-disable-line react-hooks/exhaustive-deps

  const step = (from: 'past' | 'future', to: 'past' | 'future'): void => {
    flush()
    const s = hist.current[from].pop()
    if (!s) return
    hist.current[to].push(committed.current)
    committed.current = s
    restoring.current = true
    restoreRef.current(s)
    sync()
  }

  // 참조가 매 렌더 바뀌어도 괜찮게 ref 로 최신 step 을 쓴다
  const api = useRef({ undo: () => step('past', 'future'), redo: () => step('future', 'past') })
  api.current.undo = () => step('past', 'future')
  api.current.redo = () => step('future', 'past')
  const [stable] = useState(() => ({ undo: () => api.current.undo(), redo: () => api.current.redo() }))
  return { ...stable, ...flags }
}
