import { useQuery } from '@tanstack/solid-query'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'
import { setFaviconBadge } from '@/lib/ui/dynamic-favicon-core'
import { createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import { reminderActive } from './todo-model'

export type TodoReminder = {
  path: string
  list: string
  taskId: string | null
  title: string | null
  due: string
}

const CLOCK_TICK_MS = 30_000

export function useTodoReminders() {
  const [now, setNow] = createSignal(Date.now())

  onSettled(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  })

  const remindersQuery = useQuery(() => ({
    queryKey: queryKeys.todoReminders(),
    queryFn: () =>
      api<{ reminders: TodoReminder[] }>('/api/todo/reminders', { notifyForbidden: false }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  }))

  const active = createMemo(() =>
    (remindersQuery.data?.reminders ?? []).filter((reminder) =>
      reminderActive({ due: reminder.due, remind: true, done: false }, now()),
    ),
  )
  return active
}

export function TodoReminderIndicator() {
  const active = useTodoReminders()

  createEffect(
    () => active().length > 0,
    (visible) => {
      setFaviconBadge(visible)
    },
  )

  return null
}
