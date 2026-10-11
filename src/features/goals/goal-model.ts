import { dayKey, newTodoId, parseDue, type TodoChecklistItem } from '@/features/todo/todo-model'

export const GOAL_SUFFIX = '.goal.json'
export const BOARD_NAME = 'Goals.goals-board'

export type SubgoalKind = 'general' | 'daily' | 'planned'
export type DayMark = 'planned' | 'done'
export type DayState = 'done' | 'planned' | 'missed' | 'empty'

export type Subgoal = {
  id: string
  title: string
  kind: SubgoalKind
  description?: string
  checklist?: TodoChecklistItem[]
  /** Completion of a general subgoal, which has no days. */
  done?: boolean
  /** Planned subgoals: how many times per week. */
  weeklyTarget?: number
  /** `YYYY-MM-DD`. */
  deadline?: string
  /** Day key (`YYYY-MM-DD`) to plan or completion. */
  days: Record<string, DayMark>
  /** Day key; earlier days are never shown as missed. */
  createdAt?: string
}

export type GoalDocument = {
  version: 1
  title: string
  description?: string
  checklist?: TodoChecklistItem[]
  subgoals: Subgoal[]
}

export function isGoalPath(path: string): boolean {
  return path.toLowerCase().endsWith(GOAL_SUFFIX)
}

export function isGoalsBoardPath(path: string): boolean {
  return path.toLowerCase().endsWith('.goals-board')
}

function parentPath(path: string): string {
  const index = path.replace(/\\/g, '/').lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function goalsBoardPath(goalPath: string): string {
  const parent = parentPath(goalPath)
  return parent ? `${parent}/${BOARD_NAME}` : BOARD_NAME
}

export function goalFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || 'Goal'}${GOAL_SUFFIX}`
}

export function goalTitleFromPath(path: string): string {
  const name = path.split(/[/\\]/).at(-1) ?? ''
  return isGoalPath(name) ? name.slice(0, -GOAL_SUFFIX.length) : name
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
    return itemText
      ? [{ id: text(record.id) ?? newTodoId(), text: itemText, done: record.done === true }]
      : []
  })
  return items.length ? items : undefined
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function parseDays(value: unknown): Record<string, DayMark> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const days: Record<string, DayMark> = {}
  for (const [key, mark] of Object.entries(value as Record<string, unknown>)) {
    if (DAY_KEY.test(key) && (mark === 'planned' || mark === 'done')) days[key] = mark
  }
  return days
}

function parseSubgoal(value: unknown): Subgoal | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const title = text(record.title)
  if (!title) return null
  const kind: SubgoalKind =
    record.kind === 'daily' || record.kind === 'planned' ? record.kind : 'general'
  const target = Number(record.weeklyTarget)
  return {
    id: text(record.id) ?? newTodoId(),
    title,
    kind,
    description: text(record.description),
    checklist: parseChecklist(record.checklist),
    done: record.done === true,
    weeklyTarget: Number.isInteger(target) && target >= 1 && target <= 7 ? target : undefined,
    deadline:
      typeof record.deadline === 'string' && DAY_KEY.test(record.deadline)
        ? record.deadline
        : undefined,
    days: parseDays(record.days),
    createdAt:
      typeof record.createdAt === 'string' && DAY_KEY.test(record.createdAt)
        ? record.createdAt
        : undefined,
  }
}

export function parseGoalDocument(content: string, fallbackTitle = 'Goal'): GoalDocument {
  if (!content.trim()) return { version: 1, title: fallbackTitle, subgoals: [] }
  const raw = JSON.parse(content) as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a goal')
  const record = raw as Record<string, unknown>
  const subgoals = Array.isArray(record.subgoals) ? record.subgoals : []
  return {
    version: 1,
    title: text(record.title) ?? fallbackTitle,
    description: text(record.description),
    checklist: parseChecklist(record.checklist),
    subgoals: subgoals.map(parseSubgoal).filter((subgoal) => subgoal !== null),
  }
}

export function serializeGoalDocument(document: GoalDocument): string {
  const subgoals = document.subgoals.map((subgoal) => {
    const out: Record<string, unknown> = {
      id: subgoal.id,
      title: subgoal.title,
      kind: subgoal.kind,
    }
    if (subgoal.description?.trim()) out.description = subgoal.description
    if (subgoal.checklist?.length) out.checklist = subgoal.checklist
    if (subgoal.kind === 'general' && subgoal.done) out.done = true
    if (subgoal.kind === 'planned' && subgoal.weeklyTarget) out.weeklyTarget = subgoal.weeklyTarget
    if (subgoal.deadline) out.deadline = subgoal.deadline
    if (subgoal.kind !== 'general') {
      out.days = Object.fromEntries(
        Object.entries(subgoal.days).sort(([a], [b]) => a.localeCompare(b)),
      )
    }
    if (subgoal.createdAt) out.createdAt = subgoal.createdAt
    return out
  })
  const out: Record<string, unknown> = { version: 1, title: document.title }
  if (document.description?.trim()) out.description = document.description
  if (document.checklist?.length) out.checklist = document.checklist
  out.subgoals = subgoals
  return `${JSON.stringify(out, null, 2)}\n`
}

export function newSubgoal(title: string, kind: SubgoalKind, today: Date): Subgoal {
  return { id: newTodoId(), title, kind, days: {}, createdAt: dayKey(today) }
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7))
}

/** Monday to Sunday of the week `offset` weeks away from the one containing `anchor`. */
export function weekDays(anchor: Date, offset = 0): Date[] {
  const monday = addDays(startOfWeek(anchor), offset * 7)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function dayState(subgoal: Subgoal, day: Date, today: Date): DayState {
  const key = dayKey(day)
  const mark = subgoal.days[key]
  if (mark === 'done') return 'done'
  const past = key < dayKey(today)
  if (mark === 'planned') return past ? 'missed' : 'planned'
  if (subgoal.kind === 'daily' && past && (!subgoal.createdAt || key >= subgoal.createdAt))
    return 'missed'
  return 'empty'
}

/** What a plain click on a day does: plan it, complete it, or undo the completion. */
export function nextDayMark(subgoal: Subgoal, day: Date): DayMark | undefined {
  const mark = subgoal.days[dayKey(day)]
  if (mark === 'done') return subgoal.kind === 'daily' ? undefined : 'planned'
  if (mark === 'planned') return 'done'
  return subgoal.kind === 'daily' ? 'done' : 'planned'
}

export function setDayMark(subgoal: Subgoal, day: Date, mark: DayMark | undefined) {
  const key = dayKey(day)
  if (mark) subgoal.days[key] = mark
  else delete subgoal.days[key]
}

export function moveDay(subgoal: Subgoal, from: Date, to: Date) {
  const fromKey = dayKey(from)
  const toKey = dayKey(to)
  if (fromKey === toKey) return
  const mark = subgoal.days[fromKey]
  if (!mark) return
  delete subgoal.days[fromKey]
  if (subgoal.days[toKey] !== 'done') subgoal.days[toKey] = mark
}

export function weekProgress(
  subgoal: Subgoal,
  days: Date[],
  today: Date,
): { done: number; target: number } {
  const done = days.filter((day) => subgoal.days[dayKey(day)] === 'done').length
  if (subgoal.kind === 'daily') {
    const todayKey = dayKey(today)
    const elapsed = days.filter((day) => dayKey(day) <= todayKey).length
    return { done, target: Math.max(elapsed, done) }
  }
  const scheduled = days.filter((day) => subgoal.days[dayKey(day)]).length
  return { done, target: subgoal.weeklyTarget ?? scheduled }
}

/** Consecutive completed days ending today, or yesterday while today is still open. */
export function streak(subgoal: Subgoal, today: Date): number {
  let day = subgoal.days[dayKey(today)] === 'done' ? today : addDays(today, -1)
  let count = 0
  while (subgoal.days[dayKey(day)] === 'done') {
    count += 1
    day = addDays(day, -1)
  }
  return count
}

/** Share of this week's work done across all subgoals, or null when nothing is measurable. */
export function goalProgress(document: GoalDocument, today: Date): number | null {
  const days = weekDays(today)
  let done = 0
  let target = 0
  for (const subgoal of document.subgoals) {
    if (subgoal.kind === 'general') {
      target += 1
      if (subgoal.done) done += 1
      continue
    }
    const progress = weekProgress(subgoal, days, today)
    if (progress.target === 0) continue
    target += progress.target
    done += Math.min(progress.done, progress.target)
  }
  return target === 0 ? null : done / target
}

export function daysUntil(deadline: string | undefined, today: Date): number | null {
  const date = parseDue(deadline)
  if (!date) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((date.getTime() - start.getTime()) / 86_400_000)
}

export function relevantToday(subgoal: Subgoal, today: Date): boolean {
  return subgoal.kind === 'daily' || Boolean(subgoal.days[dayKey(today)])
}

function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]))
  const localIds = new Set(local.map((item) => item.id))
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const merged: T[] = []
  for (const item of local) {
    const original = baseById.get(item.id)
    if (!original) {
      merged.push(item)
      continue
    }
    const remoteItem = remoteById.get(item.id)
    if (!remoteItem) continue
    merged.push(same(original, item) ? remoteItem : item)
  }
  for (const [index, item] of remote.entries()) {
    if (localIds.has(item.id) || baseById.has(item.id)) continue
    merged.splice(Math.min(index, merged.length), 0, item)
  }
  return merged
}

export function mergeGoalDocuments(
  base: GoalDocument,
  local: GoalDocument,
  remote: GoalDocument,
): GoalDocument {
  const pick = <K extends keyof GoalDocument>(key: K): GoalDocument[K] =>
    JSON.stringify(local[key]) === JSON.stringify(base[key]) ? remote[key] : local[key]
  return {
    version: 1,
    title: pick('title'),
    description: pick('description'),
    checklist: pick('checklist'),
    subgoals: mergeById(base.subgoals, local.subgoals, remote.subgoals),
  }
}
