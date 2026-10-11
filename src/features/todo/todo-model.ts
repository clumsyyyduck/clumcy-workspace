export const TODO_SUFFIX = '.todo.json'
export const REMINDER_LEAD_MS = 60 * 60 * 1000

export type TodoChecklistItem = { id: string; text: string; done: boolean }

export type TodoTask = {
  id: string
  title: string
  done: boolean
  description?: string
  /** Local date-time, `YYYY-MM-DDTHH:mm`; an explicit offset is also accepted. */
  due?: string
  remind?: boolean
  reminderAcknowledged?: boolean
  checklist?: TodoChecklistItem[]
  createdAt?: string
  completedAt?: string
}

export type TodoDocument = { version: 1; tasks: TodoTask[] }

export function isTodoPath(path: string): boolean {
  return path.toLowerCase().endsWith(TODO_SUFFIX)
}

export function todoListName(path: string): string {
  const name = path.split(/[/\\]/).at(-1) ?? ''
  return isTodoPath(name) ? name.slice(0, -TODO_SUFFIX.length) : name
}

export function newTodoId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function parseChecklist(value: unknown): TodoChecklistItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.flatMap((item): TodoChecklistItem[] => {
    if (typeof item === 'string')
      return item.trim() ? [{ id: newTodoId(), text: item, done: false }] : []
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const itemText = text(record.text) ?? text(record.title)
    if (!itemText) return []
    return [{ id: text(record.id) ?? newTodoId(), text: itemText, done: record.done === true }]
  })
  return items.length ? items : undefined
}

function parseTask(value: unknown): TodoTask | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const title = text(record.title)
  if (!title) return null
  return {
    id: text(record.id) ?? newTodoId(),
    title,
    done: record.done === true,
    description: text(record.description),
    due: text(record.due),
    remind: record.remind === true,
    reminderAcknowledged: record.reminderAcknowledged === true,
    checklist: parseChecklist(record.checklist),
    createdAt: text(record.createdAt),
    completedAt: text(record.completedAt),
  }
}

export function parseTodoDocument(content: string): TodoDocument {
  if (!content.trim()) return { version: 1, tasks: [] }
  const raw = JSON.parse(content) as unknown
  const tasks = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>).tasks
      : undefined
  if (!Array.isArray(tasks)) throw new Error('Not a todo list')
  return { version: 1, tasks: tasks.map(parseTask).filter((task) => task !== null) }
}

export function serializeTodoDocument(document: TodoDocument): string {
  const tasks = document.tasks.map((task) => {
    const out: Record<string, unknown> = { id: task.id, title: task.title, done: task.done }
    if (task.description?.trim()) out.description = task.description
    if (task.due) {
      out.due = task.due
      out.remind = task.remind === true
      if (task.reminderAcknowledged) out.reminderAcknowledged = true
    }
    if (task.checklist?.length) out.checklist = task.checklist
    if (task.createdAt) out.createdAt = task.createdAt
    if (task.done && task.completedAt) out.completedAt = task.completedAt
    return out
  })
  return `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`
}

export function parseDue(due: string | undefined): Date | null {
  if (!due) return null
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due)
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  const date = new Date(due)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Formats a due value for `<input type="datetime-local">`. */
export function dueInputValue(due: string | undefined): string {
  const date = parseDue(due)
  if (!date) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export const DEFAULT_DUE_TIME = '09:00'

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKey(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

/** Builds a due value from a local calendar day and `HH:mm`. */
export function composeDue(day: Date, time: string): string {
  return `${dayKey(day)}T${time}`
}

export function dueTime(due: string | undefined): string {
  return dueInputValue(due).slice(11) || DEFAULT_DUE_TIME
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Days shown for a month, in whole weeks starting on Monday. */
export function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  return Array.from(
    { length: weeks * 7 },
    (_, index) => new Date(first.getFullYear(), first.getMonth(), index - offset + 1),
  )
}

export function reminderActive(
  task: Pick<TodoTask, 'due' | 'remind' | 'done' | 'reminderAcknowledged'>,
  now: number,
): boolean {
  if (!task.remind || task.done || task.reminderAcknowledged) return false
  const due = parseDue(task.due)
  return due !== null && now >= due.getTime() - REMINDER_LEAD_MS
}

/**
 * Re-applies local edits on top of a remote version that changed underneath
 * (for example a task added by Hermes while the list was open).
 */
export function mergeTodoDocuments(
  base: TodoDocument,
  local: TodoDocument,
  remote: TodoDocument,
): TodoDocument {
  const baseById = new Map(base.tasks.map((task) => [task.id, task]))
  const localById = new Map(local.tasks.map((task) => [task.id, task]))
  const remoteIds = new Set(remote.tasks.map((task) => task.id))
  const sameTask = (a: TodoTask | undefined, b: TodoTask | undefined) =>
    JSON.stringify(a) === JSON.stringify(b)

  const merged: TodoTask[] = []
  for (const task of local.tasks) {
    const original = baseById.get(task.id)
    if (!original) {
      merged.push(task)
      continue
    }
    if (!remoteIds.has(task.id)) continue
    const remoteTask = remote.tasks.find((candidate) => candidate.id === task.id)
    merged.push(sameTask(original, task) && remoteTask ? remoteTask : task)
  }
  for (const [index, task] of remote.tasks.entries()) {
    if (localById.has(task.id) || baseById.has(task.id)) continue
    merged.splice(Math.min(index, merged.length), 0, task)
  }
  return { version: 1, tasks: merged }
}

export function formatDue(due: string | undefined, now = new Date()): string {
  const date = parseDue(due)
  if (!date) return ''
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Tomorrow, ${time}`
  if (days === -1) return `Yesterday, ${time}`
  const sameYear = date.getFullYear() === now.getFullYear()
  const day = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${day}, ${time}`
}
