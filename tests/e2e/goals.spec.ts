import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { gotoWorkspace } from './workspace-layout-helpers'

const FOLDER = 'Notes/Goals'
const BOARD = `${FOLDER}/Goals.goals-board`

type StoredSubgoal = {
  id: string
  title: string
  kind: string
  done?: boolean
  weeklyTarget?: number
  deadline?: string
  days?: Record<string, string>
}

function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function shift(days: number) {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
}

async function putGoal(request: APIRequestContext, name: string, document: object) {
  const path = `${FOLDER}/${name}.goal.json`
  const content = JSON.stringify(document)
  const edited = await request.post('/api/files/edit', { data: { path, content } })
  if (!edited.ok()) {
    const created = await request.post('/api/files/create', { data: { path, content } })
    expect(created.ok()).toBe(true)
  }
  return path
}

async function readGoal(request: APIRequestContext, path: string) {
  const response = await request.get(`/api/files/text?path=${encodeURIComponent(path)}`)
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { content: string }
  return JSON.parse(body.content) as { title: string; subgoals: StoredSubgoal[] }
}

function openViewer(page: Page, path: string) {
  return page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)
}

test.describe('Goals', () => {
  test('home opens the board, which creates a goal and opens it', async ({ page }) => {
    const title = `Health ${Date.now()}`
    await page.goto('/?dir=')
    await page.locator('table').getByText('Goals', { exact: true }).click()
    await expect(page.getByTestId('goals-board')).toBeVisible()

    await page.getByRole('tab', { name: 'All' }).click()
    await page.getByRole('textbox', { name: 'New goal' }).fill(title)
    await page.getByRole('textbox', { name: 'New goal' }).press('Enter')

    const goal = page.getByTestId('goal')
    await expect(goal.getByRole('textbox', { name: 'Goal title' })).toHaveValue(title)
    await goal.getByRole('button', { name: 'Goals' }).click()
    await page.getByRole('tab', { name: 'All' }).click()
    await expect(page.getByTestId('board-goal').filter({ hasText: title })).toBeVisible()
  })

  test('renaming the goal renames its file', async ({ page }) => {
    const stamp = Date.now()
    const path = await putGoal(page.request, `rename-${stamp}`, {
      version: 1,
      title: `rename-${stamp}`,
      subgoals: [],
    })
    await openViewer(page, path)
    const title = page.getByTestId('goal').getByRole('textbox', { name: 'Goal title', exact: true })
    await title.fill(`Hobby ${stamp}`)
    await title.press('Enter')
    const renamed = `${FOLDER}/Hobby ${stamp}.goal.json`
    const exists = async (target: string) =>
      (await page.request.get(`/api/files/text?path=${encodeURIComponent(target)}`)).ok()
    await expect.poll(() => exists(renamed)).toBe(true)
    expect(await exists(path)).toBe(false)
    expect((await readGoal(page.request, renamed)).title).toBe(`Hobby ${stamp}`)
    await expect.poll(() => new URL(page.url()).searchParams.get('viewing')).toBe(renamed)
  })

  test('goal header stays in place while subgoals scroll', async ({ page }) => {
    const path = await putGoal(page.request, `sticky-${Date.now()}`, {
      version: 1,
      title: 'Sticky',
      subgoals: Array.from({ length: 30 }, (_, index) => ({
        id: `s${index}`,
        title: `Step ${index}`,
        kind: 'general',
      })),
    })
    await openViewer(page, path)
    const title = page.getByTestId('goal').getByRole('textbox', { name: 'Goal title', exact: true })
    const last = page.getByTestId('goal').locator('textarea').last()
    await expect(last).toHaveValue('Step 29')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await expect(title).toBeInViewport()
    await expect(page.getByTestId('goal').getByRole('button', { name: 'Goals' })).toBeInViewport()
  })

  test('links in notes are clickable and the notes stay editable', async ({ page }) => {
    const path = await putGoal(page.request, `links-${Date.now()}`, {
      version: 1,
      title: 'Links',
      description: 'Boots: https://example.com/boots, size 38',
      subgoals: [],
    })
    await openViewer(page, path)
    const notes = page.getByRole('textbox', { name: 'Goal notes' })
    const link = notes.getByRole('link', { name: 'https://example.com/boots' })
    await expect(link).toHaveAttribute('href', 'https://example.com/boots')
    await expect(link).toHaveAttribute('target', '_blank')

    await notes.click({ position: { x: 4, y: 4 } })
    const editor = page.getByRole('textbox', { name: 'Goal notes' })
    await expect(editor).toBeFocused()
    await page.keyboard.type(' ok')
    await page.getByRole('heading', { name: /Subgoals/ }).click()
    await expect
      .poll(async () => {
        const response = await page.request.get(`/api/files/text?path=${encodeURIComponent(path)}`)
        return JSON.parse(((await response.json()) as { content: string }).content).description
      })
      .toBe('Boots: https://example.com/boots, size 38 ok')
    await expect(link).toBeVisible()
  })

  test('day circles plan, complete, move and remove days', async ({ page }) => {
    const path = await putGoal(page.request, `circles-${Date.now()}`, {
      version: 1,
      title: 'Ski',
      subgoals: [{ id: 'ski', title: 'Ski preparation', kind: 'planned', days: {} }],
    })
    await openViewer(page, path)
    const today = dayKey(shift(0))
    const circle = page.locator(`[data-day="${today}"]`)

    await circle.click()
    await expect(circle).toHaveAttribute('data-state', 'planned')
    await circle.click()
    await expect(circle).toHaveAttribute('data-state', 'done')
    await expect
      .poll(async () => (await readGoal(page.request, path)).subgoals[0]!.days)
      .toEqual({ [today]: 'done' })

    await circle.click({ button: 'right' })
    await page.getByTestId('goal-day-menu').getByRole('menuitem', { name: 'Undo done' }).click()
    await expect(circle).toHaveAttribute('data-state', 'planned')

    await circle.click({ button: 'right' })
    await page.getByTestId('goal-day-menu').getByRole('menuitem', { name: 'Move to…' }).click()
    const target = shift(1)
    const label = await page.evaluate(
      (time) =>
        new Date(time).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      target.getTime(),
    )
    await page
      .getByTestId('todo-calendar')
      .getByRole('gridcell', { name: label, exact: true })
      .click()
    await expect
      .poll(async () => (await readGoal(page.request, path)).subgoals[0]!.days)
      .toEqual({ [dayKey(target)]: 'planned' })

    if (shift(1).getDay() !== 1) {
      const moved = page.locator(`[data-day="${dayKey(target)}"]`)
      await moved.click({ button: 'right' })
      await page.getByTestId('goal-day-menu').getByRole('menuitem', { name: 'Remove plan' }).click()
      await expect
        .poll(async () => (await readGoal(page.request, path)).subgoals[0]!.days)
        .toEqual({})
    }
  })

  test('the calendar plans future days', async ({ page }) => {
    const path = await putGoal(page.request, `plan-${Date.now()}`, {
      version: 1,
      title: 'Ski',
      subgoals: [{ id: 'ski', title: 'Ski preparation', kind: 'planned', days: {} }],
    })
    await openViewer(page, path)
    await page.getByRole('button', { name: 'Plan days' }).click()
    const calendar = page.getByTestId('goal-plan-calendar')
    await expect(calendar).toBeVisible()

    const target = shift(3)
    const label = await page.evaluate(
      (time) =>
        new Date(time).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      target.getTime(),
    )
    if (target.getMonth() !== shift(0).getMonth())
      await calendar.getByRole('button', { name: 'Next month' }).click()
    await calendar.getByRole('gridcell', { name: label, exact: true }).click()
    await expect(calendar.getByText('1 planned ahead')).toBeVisible()
    await calendar.getByRole('button', { name: 'Done' }).click()
    await expect
      .poll(async () => (await readGoal(page.request, path)).subgoals[0]!.days)
      .toEqual({ [dayKey(target)]: 'planned' })
  })

  test('subgoal settings: kind, weekly target and deadline', async ({ page }) => {
    const path = await putGoal(page.request, `settings-${Date.now()}`, {
      version: 1,
      title: 'Reading',
      subgoals: [{ id: 'r', title: 'Read', kind: 'general' }],
    })
    await openViewer(page, path)
    await page.getByRole('button', { name: 'Show details' }).click()
    await page.getByRole('radio', { name: 'Planned' }).click()
    await page.getByRole('button', { name: 'More times a week' }).click()
    await page.getByRole('button', { name: 'More times a week' }).click()
    await expect(page.getByTestId('weekly-target')).toHaveText('2× a week')

    await page.getByRole('button', { name: 'Deadline' }).click()
    const calendar = page.getByTestId('todo-calendar')
    await calendar.getByRole('button', { name: 'Next month' }).click()
    await calendar.getByRole('gridcell').nth(10).click()
    await calendar.getByRole('button', { name: 'Done' }).click()

    await expect
      .poll(async () => {
        const subgoal = (await readGoal(page.request, path)).subgoals[0]!
        return [
          subgoal.kind,
          subgoal.weeklyTarget,
          /^\d{4}-\d{2}-\d{2}$/.test(subgoal.deadline ?? ''),
        ]
      })
      .toEqual(['planned', 2, true])
  })

  test('board filters show today, general and daily subgoals', async ({ page }) => {
    const name = `board-${Date.now()}`
    const path = await putGoal(page.request, name, {
      version: 1,
      title: name,
      subgoals: [
        {
          id: 'p',
          title: `${name} planned`,
          kind: 'planned',
          days: { [dayKey(shift(0))]: 'planned' },
        },
        { id: 'g', title: `${name} general`, kind: 'general' },
        { id: 'd', title: `${name} daily`, kind: 'daily', days: {} },
      ],
    })
    await page.goto(`/?dir=&viewing=${encodeURIComponent(BOARD)}`)
    const board = page.getByTestId('goals-board')

    const plannedRow = board.getByTestId('board-subgoal').filter({ hasText: `${name} planned` })
    await expect(plannedRow).toBeVisible()
    await expect(
      board.getByTestId('board-subgoal').filter({ hasText: `${name} daily` }),
    ).toBeVisible()
    await plannedRow.getByRole('button', { name: 'Done today' }).click()
    await expect
      .poll(async () => (await readGoal(page.request, path)).subgoals[0]!.days)
      .toEqual({ [dayKey(shift(0))]: 'done' })

    await board.getByRole('tab', { name: 'General' }).click()
    const generalRow = board.getByTestId('board-subgoal').filter({ hasText: `${name} general` })
    await generalRow.getByRole('checkbox', { name: 'Mark as done' }).click()
    await expect.poll(async () => (await readGoal(page.request, path)).subgoals[1]!.done).toBe(true)

    await board.getByRole('tab', { name: 'Daily' }).click()
    await expect(
      board.getByTestId('board-daily').filter({ hasText: `${name} daily` }),
    ).toBeVisible()
    await expect(
      board.getByTestId('board-daily').filter({ hasText: `${name} planned` }),
    ).toHaveCount(0)
  })

  test('goal opens from the board inside a workspace window', async ({ page }) => {
    const name = `workspace-${Date.now()}`
    await putGoal(page.request, name, { version: 1, title: name, subgoals: [] })
    await gotoWorkspace(page)
    await page.getByText('Goals', { exact: true }).first().click()
    const board = page.getByTestId('goals-board')
    await expect(board).toBeVisible()
    await board.getByRole('tab', { name: 'All' }).click()
    await board.getByTestId('board-goal').filter({ hasText: name }).click()
    await expect(page.getByTestId('goal').getByRole('textbox', { name: 'Goal title' })).toHaveValue(
      name,
    )
  })
})
