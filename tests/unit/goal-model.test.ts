import { describe, expect, test } from 'bun:test'

import {
  dayState,
  daysUntil,
  goalFileName,
  goalProgress,
  goalsBoardPath,
  mergeGoalDocuments,
  moveDay,
  nextDayMark,
  parseGoalDocument,
  serializeGoalDocument,
  streak,
  weekDays,
  weekProgress,
  type GoalDocument,
  type Subgoal,
} from '@/features/goals/goal-model'

const subgoal = (extra: Partial<Subgoal> = {}): Subgoal => ({
  id: 's',
  title: 'Ski prep',
  kind: 'planned',
  days: {},
  ...extra,
})

// Wednesday, 14 October 2026.
const today = new Date(2026, 9, 14)

describe('goal model', () => {
  test('weeks run Monday to Sunday', () => {
    const days = weekDays(today)
    expect(days.map((day) => day.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18])
    expect(weekDays(today, 1)[0]!.getDate()).toBe(19)
    expect(weekDays(today, -1)[6]!.getDate()).toBe(11)
  })

  test('day states distinguish done, planned, missed and empty', () => {
    const goal = subgoal({
      days: { '2026-10-12': 'planned', '2026-10-13': 'done', '2026-10-16': 'planned' },
    })
    expect(dayState(goal, new Date(2026, 9, 12), today)).toBe('missed')
    expect(dayState(goal, new Date(2026, 9, 13), today)).toBe('done')
    expect(dayState(goal, new Date(2026, 9, 16), today)).toBe('planned')
    expect(dayState(goal, new Date(2026, 9, 17), today)).toBe('empty')
  })

  test('daily subgoals only count missed days after they were created', () => {
    const daily = subgoal({ kind: 'daily', createdAt: '2026-10-13' })
    expect(dayState(daily, new Date(2026, 9, 12), today)).toBe('empty')
    expect(dayState(daily, new Date(2026, 9, 13), today)).toBe('missed')
  })

  test('a click plans, completes, then undoes', () => {
    const goal = subgoal()
    expect(nextDayMark(goal, today)).toBe('planned')
    goal.days['2026-10-14'] = 'planned'
    expect(nextDayMark(goal, today)).toBe('done')
    goal.days['2026-10-14'] = 'done'
    expect(nextDayMark(goal, today)).toBe('planned')
    expect(nextDayMark(subgoal({ kind: 'daily' }), today)).toBe('done')
  })

  test('moving a planned day keeps a completed target day', () => {
    const goal = subgoal({ days: { '2026-10-15': 'planned', '2026-10-17': 'done' } })
    moveDay(goal, new Date(2026, 9, 15), new Date(2026, 9, 16))
    expect(goal.days).toEqual({ '2026-10-16': 'planned', '2026-10-17': 'done' })
    moveDay(goal, new Date(2026, 9, 16), new Date(2026, 9, 17))
    expect(goal.days).toEqual({ '2026-10-17': 'done' })
  })

  test('weekly progress uses the target, or the planned days without one', () => {
    const days = weekDays(today)
    const goal = subgoal({ days: { '2026-10-12': 'done', '2026-10-15': 'planned' } })
    expect(weekProgress(goal, days, today)).toEqual({ done: 1, target: 2 })
    expect(weekProgress({ ...goal, weeklyTarget: 3 }, days, today)).toEqual({ done: 1, target: 3 })
  })

  test('streak continues through yesterday while today is open', () => {
    const daily = subgoal({
      kind: 'daily',
      days: { '2026-10-11': 'done', '2026-10-12': 'done', '2026-10-13': 'done' },
    })
    expect(streak(daily, today)).toBe(3)
    daily.days['2026-10-14'] = 'done'
    expect(streak(daily, today)).toBe(4)
    expect(streak(subgoal(), today)).toBe(0)
  })

  test('goal progress combines subgoals for the current week', () => {
    const document: GoalDocument = {
      version: 1,
      title: 'Health',
      subgoals: [
        subgoal({ id: 'a', weeklyTarget: 2, days: { '2026-10-12': 'done' } }),
        subgoal({ id: 'b', kind: 'general', done: true }),
      ],
    }
    expect(goalProgress(document, today)).toBeCloseTo(2 / 3)
    expect(goalProgress({ version: 1, title: 'Empty', subgoals: [] }, today)).toBeNull()
  })

  test('counts days until a deadline', () => {
    expect(daysUntil('2026-10-20', today)).toBe(6)
    expect(daysUntil(undefined, today)).toBeNull()
  })

  test('round-trips and drops invalid data', () => {
    const parsed = parseGoalDocument(
      JSON.stringify({
        title: 'Health',
        subgoals: [
          {
            id: 'a',
            title: 'Ski',
            kind: 'planned',
            weeklyTarget: 9,
            days: { bad: 'done', '2026-10-12': 'done' },
          },
          { id: 'b', title: '' },
        ],
      }),
    )
    expect(parsed.subgoals).toHaveLength(1)
    expect(parsed.subgoals[0]!.weeklyTarget).toBeUndefined()
    expect(parsed.subgoals[0]!.days).toEqual({ '2026-10-12': 'done' })
    expect(parseGoalDocument(serializeGoalDocument(parsed))).toEqual(parsed)
    expect(parseGoalDocument('', 'Health').title).toBe('Health')
  })

  test('merges a remotely added subgoal with local edits', () => {
    const base: GoalDocument = { version: 1, title: 'Health', subgoals: [subgoal({ id: 'a' })] }
    const local: GoalDocument = {
      ...base,
      subgoals: [subgoal({ id: 'a', days: { '2026-10-14': 'done' } })],
    }
    const remote: GoalDocument = {
      ...base,
      title: 'Health 2026',
      subgoals: [subgoal({ id: 'a' }), subgoal({ id: 'r', title: 'Sleep' })],
    }
    const merged = mergeGoalDocuments(base, local, remote)
    expect(merged.title).toBe('Health 2026')
    expect(merged.subgoals.map((entry) => entry.id)).toEqual(['a', 'r'])
    expect(merged.subgoals[0]!.days).toEqual({ '2026-10-14': 'done' })
  })

  test('builds file names and the board path', () => {
    expect(goalFileName('Health: body/mind')).toBe('Health body mind.goal.json')
    expect(goalsBoardPath('Goals/Health.goal.json')).toBe('Goals/Goals.goals-board')
  })
})
