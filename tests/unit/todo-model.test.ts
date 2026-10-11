import { describe, expect, test } from 'bun:test'

import {
  REMINDER_LEAD_MS,
  calendarDays,
  composeDue,
  dueTime,
  dueInputValue,
  isTodoPath,
  mergeTodoDocuments,
  parseTodoDocument,
  reminderActive,
  serializeTodoDocument,
  todoListName,
  type TodoDocument,
  type TodoTask,
} from '@/features/todo/todo-model'

const task = (id: string, title: string, extra: Partial<TodoTask> = {}): TodoTask => ({
  id,
  title,
  done: false,
  ...extra,
})

const doc = (...tasks: TodoTask[]): TodoDocument => ({ version: 1, tasks })

describe('todo model', () => {
  test('recognizes todo list paths and names', () => {
    expect(isTodoPath('thoughts/TODO/work.todo.json')).toBe(true)
    expect(isTodoPath('thoughts/TODO/Work.TODO.JSON')).toBe(true)
    expect(isTodoPath('thoughts/notes.json')).toBe(false)
    expect(todoListName('thoughts/TODO/work.todo.json')).toBe('work')
  })

  test('treats an empty file as an empty list and drops untitled tasks', () => {
    expect(parseTodoDocument('')).toEqual({ version: 1, tasks: [] })
    const parsed = parseTodoDocument(
      JSON.stringify({
        tasks: [
          { id: 'a', title: 'Call' },
          { id: 'b', title: '  ' },
        ],
      }),
    )
    expect(parsed.tasks.map((entry) => entry.id)).toEqual(['a'])
  })

  test('accepts checklist items written as plain strings', () => {
    const parsed = parseTodoDocument(
      JSON.stringify({ tasks: [{ id: 'a', title: 'Trip', checklist: ['Passport', ''] }] }),
    )
    expect(parsed.tasks[0]!.checklist?.map((item) => item.text)).toEqual(['Passport'])
  })

  test('round-trips through serialization', () => {
    const original = doc(
      task('a', 'Plan', {
        due: '2026-10-05T14:00',
        remind: true,
        description: 'Agenda',
        checklist: [{ id: 'c', text: 'Slides', done: true }],
      }),
    )
    expect(parseTodoDocument(serializeTodoDocument(original))).toEqual(
      parseTodoDocument(JSON.stringify(original)),
    )
  })

  test('reminder becomes active one hour before the start', () => {
    const due = '2026-10-05T14:00'
    const start = new Date(due).getTime()
    const reminder = { due, remind: true, done: false }
    expect(reminderActive(reminder, start - REMINDER_LEAD_MS - 1)).toBe(false)
    expect(reminderActive(reminder, start - REMINDER_LEAD_MS)).toBe(true)
    expect(reminderActive({ ...reminder, reminderAcknowledged: true }, start)).toBe(false)
    expect(reminderActive({ ...reminder, done: true }, start)).toBe(false)
    expect(reminderActive({ ...reminder, remind: false }, start)).toBe(false)
  })

  test('formats due values for datetime inputs', () => {
    expect(dueInputValue('2026-10-05T14:00')).toBe('2026-10-05T14:00')
    expect(dueInputValue('nonsense')).toBe('')
  })

  test('merges a task added elsewhere with local edits', () => {
    const base = doc(task('a', 'One'), task('b', 'Two'))
    const local = doc(task('a', 'One', { done: true }), task('b', 'Two'), task('l', 'Local'))
    const remote = doc(task('a', 'One'), task('b', 'Two renamed'), task('r', 'Remote'))
    const merged = mergeTodoDocuments(base, local, remote)
    expect(merged.tasks.map((entry) => [entry.id, entry.title, entry.done])).toEqual([
      ['a', 'One', true],
      ['b', 'Two renamed', false],
      ['r', 'Remote', false],
      ['l', 'Local', false],
    ])
  })

  test('keeps local deletions and remote deletions when merging', () => {
    const base = doc(task('a', 'One'), task('b', 'Two'))
    const local = doc(task('b', 'Two'))
    const remote = doc(task('a', 'One'))
    expect(mergeTodoDocuments(base, local, remote).tasks).toEqual([])
  })

  test('calendar weeks start on Monday and cover the whole month', () => {
    const days = calendarDays(new Date(2026, 9, 15))
    expect(days.length % 7).toBe(0)
    expect(days[0]!.getDay()).toBe(1)
    expect(days.at(-1)!.getDay()).toBe(0)
    expect(days[0]!.getDate()).toBe(28)
    expect(days.some((day) => day.getMonth() === 9 && day.getDate() === 31)).toBe(true)
  })

  test('composes and splits due values', () => {
    expect(composeDue(new Date(2026, 0, 5), '08:30')).toBe('2026-01-05T08:30')
    expect(dueTime('2026-01-05T08:30')).toBe('08:30')
    expect(dueTime(undefined)).toBe('09:00')
  })
})
