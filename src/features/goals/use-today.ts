import { createSignal, onSettled } from 'solid-js'
import { sameDay } from '@/features/todo/todo-model'

const CHECK_MS = 60_000

/** Today's date, refreshed when the day changes while the page stays open. */
export function useToday() {
  const [today, setToday] = createSignal(new Date())
  onSettled(() => {
    const timer = window.setInterval(() => {
      const now = new Date()
      if (!sameDay(now, today())) setToday(now)
    }, CHECK_MS)
    return () => window.clearInterval(timer)
  })
  return today
}
