import { test, expect, type APIRequestContext } from '@playwright/test'

const FOLDER = 'Notes/TODO'

async function putFile(request: APIRequestContext, path: string, content: string) {
  const edited = await request.post('/api/files/edit', { data: { path, content } })
  if (edited.ok()) return
  const created = await request.post('/api/files/create', { data: { path, content } })
  expect(created.ok()).toBe(true)
}

async function readList(request: APIRequestContext, path: string) {
  const response = await request.get(`/api/files/text?path=${encodeURIComponent(path)}`)
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { content: string }
  return JSON.parse(body.content || '{"tasks":[]}') as {
    tasks: { id: string; title: string; done: boolean; reminderAcknowledged?: boolean }[]
  }
}

function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

test.describe('Todo lists', () => {
  test('library root links to the TODO folder', async ({ page }) => {
    await putFile(page.request, `${FOLDER}/root-link.todo.json`, '')
    await page.goto('/?dir=')
    await page.locator('table').getByText('TODO', { exact: true }).click()
    await page.waitForURL(/dir=Notes%2FTODO|dir=Notes\/TODO/)
    await expect(page.locator('table').getByText('root-link.todo.json')).toBeVisible()
  })

  test('adds, completes and persists tasks', async ({ page }) => {
    const path = `${FOLDER}/ui-flow.todo.json`
    await putFile(page.request, path, '')
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)

    const list = page.getByTestId('todo-list')
    await expect(list.getByRole('heading', { name: 'ui-flow' })).toBeVisible()
    await list.getByRole('textbox', { name: 'New task' }).fill('Buy milk')
    await list.getByRole('textbox', { name: 'New task' }).press('Enter')
    await expect(list.getByRole('textbox', { name: 'Task title' })).toHaveValue('Buy milk')

    await expect
      .poll(async () => (await readList(page.request, path)).tasks.map((task) => task.title))
      .toEqual(['Buy milk'])

    await list.getByRole('checkbox', { name: 'Mark as done' }).click()
    await expect(list.getByRole('button', { name: /Completed/ })).toBeVisible()
    await expect.poll(async () => (await readList(page.request, path)).tasks[0]?.done).toBe(true)
  })

  test('shows tasks added through the API while the list is open', async ({ page }) => {
    const path = `${FOLDER}/api-live.todo.json`
    await putFile(page.request, path, '')
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)
    await expect(page.getByTestId('todo-list').getByText('No tasks yet.')).toBeVisible()

    const response = await page.request.post('/api/todo/tasks', {
      data: { list: 'api-live', title: 'From agent', checklist: ['Step one'] },
    })
    expect(response.ok()).toBe(true)

    await expect(page.getByRole('textbox', { name: 'Task title' })).toHaveValue('From agent', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('todo-task').getByText('0/1')).toBeVisible()
  })

  test('reminder appears an hour before start and can be acknowledged', async ({ page }) => {
    const path = `${FOLDER}/reminder.todo.json`
    const due = localInputValue(new Date(Date.now() + 30 * 60 * 1000))
    await putFile(
      page.request,
      path,
      JSON.stringify({
        version: 1,
        tasks: [{ id: 'soon', title: 'Standup', done: false, due, remind: true }],
      }),
    )
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)

    const reminder = page.getByTestId('todo-reminder')
    await expect(reminder).toBeVisible()
    await reminder.getByRole('button', { name: 'OK' }).click()
    await expect(reminder).toBeHidden()
    await expect
      .poll(async () => (await readList(page.request, path)).tasks[0]?.reminderAcknowledged)
      .toBe(true)
  })

  test('long titles wrap instead of being cut off', async ({ page }) => {
    const path = `${FOLDER}/wrapping.todo.json`
    const title =
      'Prepare the quarterly report with numbers from finance and send it to the manager'
    await putFile(
      page.request,
      path,
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 'long',
            title,
            done: false,
            checklist: [{ id: 'c', text: `${title} before Friday`, done: false }],
          },
        ],
      }),
    )
    await page.setViewportSize({ width: 360, height: 700 })
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)

    const titleField = page.getByRole('textbox', { name: 'Task title' })
    await expect(titleField).toHaveValue(title)
    const fitsContent = (field: HTMLElement) =>
      field.scrollHeight <= field.clientHeight + 1 && field.clientHeight > 30
    await expect.poll(() => titleField.evaluate(fitsContent)).toBe(true)

    await page.getByRole('button', { name: 'Show details' }).click({ force: true })
    const item = page.getByRole('textbox', { name: 'Checklist item', exact: true })
    await expect.poll(() => item.evaluate(fitsContent)).toBe(true)

    await titleField.press('End')
    await titleField.press('Enter')
    await expect(titleField).toHaveValue(title)
  })

  test('custom calendar starts on Monday and sets the start date', async ({ page }) => {
    const path = `${FOLDER}/calendar.todo.json`
    await putFile(
      page.request,
      path,
      JSON.stringify({ version: 1, tasks: [{ id: 'cal', title: 'Plan trip', done: false }] }),
    )
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)
    await page.getByRole('button', { name: 'Show details' }).click({ force: true })
    const task = page.getByTestId('todo-task')
    const heightBefore = (await task.boundingBox())!.height
    await page.getByRole('button', { name: 'Start date and time' }).click()

    const calendar = page.getByTestId('todo-calendar')
    await expect(calendar).toBeVisible()
    expect((await task.boundingBox())!.height).toBe(heightBefore)
    const firstDay = await calendar.getByRole('gridcell').first().getAttribute('aria-label')
    const monday = await page.evaluate(() =>
      new Date(2024, 0, 1).toLocaleDateString(undefined, { weekday: 'long' }),
    )
    expect(firstDay?.toLowerCase().startsWith(monday.toLowerCase())).toBe(true)

    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth(), 15)
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
    await calendar.getByRole('gridcell', { name: label, exact: true }).click()
    await calendar.getByRole('textbox', { name: 'Start time' }).fill('14:30')
    await calendar.getByRole('button', { name: 'Done' }).click()
    await expect(calendar).toBeHidden()

    const pad = (value: number) => String(value).padStart(2, '0')
    const expected = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-15T14:30`
    await expect
      .poll(async () => (await readList(page.request, path)).tasks[0] as unknown)
      .toMatchObject({ due: expected })
  })

  test('calendar floats above the trigger when there is no room below', async ({ page }) => {
    const path = `${FOLDER}/calendar-flip.todo.json`
    await putFile(
      page.request,
      path,
      JSON.stringify({ version: 1, tasks: [{ id: 'flip', title: 'Dentist', done: false }] }),
    )
    const viewport = { width: 900, height: 420 }
    await page.setViewportSize(viewport)
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)
    await page.getByRole('button', { name: 'Show details' }).click({ force: true })
    const trigger = page.getByRole('button', { name: 'Start date and time' })
    await trigger.click()

    const calendar = page.getByTestId('todo-calendar')
    await expect(calendar).toBeVisible()
    const triggerBox = (await trigger.boundingBox())!
    await expect
      .poll(async () => {
        const box = (await calendar.boundingBox())!
        return box.y + box.height <= triggerBox.y && box.y >= 0
      })
      .toBe(true)
    const box = (await calendar.boundingBox())!
    expect(box.x).toBeGreaterThan(0)
    expect(box.x + box.width).toBeLessThan(viewport.width)

    await page.mouse.click(viewport.width - 24, viewport.height - 24)
    await expect(calendar).toBeHidden()
  })

  test('expanding a task with notes does not shift the list sideways', async ({ page }) => {
    const path = `${FOLDER}/no-jump.todo.json`
    const tasks = Array.from({ length: 6 }, (_, index) => ({
      id: `t${index}`,
      title: `Task ${index}`,
      done: false,
      description: index === 0 ? ['One', 'Two', 'Three', 'Four', 'Five'].join('\n') : undefined,
      checklist: index === 0 ? ['One', 'Two', 'Three'] : undefined,
    }))
    await putFile(page.request, path, JSON.stringify({ version: 1, tasks }))
    await page.setViewportSize({ width: 900, height: 520 })
    await page.goto(`/?dir=${encodeURIComponent(FOLDER)}&viewing=${encodeURIComponent(path)}`)

    const heading = page.getByTestId('todo-list').getByRole('heading')
    await expect(heading).toBeVisible()
    const before = (await heading.boundingBox())!.x
    await page.getByRole('button', { name: 'Show details' }).first().click({ force: true })

    const notes = page.getByRole('textbox', { name: 'Notes' })
    await expect(notes).toBeVisible()
    expect((await heading.boundingBox())!.x).toBe(before)
    // Headless Chromium hides scrollbars, so assert the gutter that prevents the shift.
    const gutter = await heading.evaluate((element) => {
      let node: Element | null = element
      while (node && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement
      return node ? getComputedStyle(node).scrollbarGutter : null
    })
    expect(gutter).toBe('stable')
    await expect
      .poll(() => notes.evaluate((field) => field.scrollHeight <= field.clientHeight + 1))
      .toBe(true)
  })
})
