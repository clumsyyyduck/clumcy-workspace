import { useQuery, useQueryClient } from '@tanstack/solid-query'
import Check from 'lucide-solid/icons/check'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import Flame from 'lucide-solid/icons/flame'
import Plus from 'lucide-solid/icons/plus'
import { For, Show, createMemo, createSignal } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { TodoCheck } from '@/features/todo/TodoCheck'
import { dayKey } from '@/features/todo/todo-model'
import {
  createTextDocumentTarget,
  enqueueTextDocumentSave,
} from '@/features/viewer/text-document-target'
import { api, isApiError, post } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'
import { closeViewer } from '@/lib/browser/url-state-actions'
import { cn } from '@/lib/ui/cn'
import { PlannerChrome } from './GoalPane'
import { GoalWeekStrip } from './GoalWeekStrip'
import { ProgressRing } from './ProgressRing'
import { KIND_LABELS, deadlineLabel } from './SubgoalCard'
import {
  dayState,
  goalFileName,
  goalProgress,
  goalTitleFromPath,
  parseGoalDocument,
  relevantToday,
  serializeGoalDocument,
  streak,
  type GoalDocument,
  type Subgoal,
} from './goal-model'
import { useToday } from './use-today'

type GoalEntry = { path: string; content: string; version: string }
type GoalsResponse = { folder: string; board: string; editable: boolean; goals: GoalEntry[] }
type Goal = { path: string; document: GoalDocument }

type Filter = 'today' | 'all' | 'general' | 'daily'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'daily', label: 'Daily' },
]

export type GoalsBoardPaneProps = {
  embedded?: boolean
  showClose?: boolean
  onClose?: () => void
  onNavigate?: (path: string) => void
}

function parseEntry(entry: GoalEntry): Goal | null {
  try {
    return {
      path: entry.path,
      document: parseGoalDocument(entry.content, goalTitleFromPath(entry.path)),
    }
  } catch {
    return null
  }
}

function SubgoalRow(props: {
  goal: Goal
  subgoal: Subgoal
  showGoal: boolean
  leading?: JSX.Element
  trailing?: JSX.Element
  onOpen: () => void
}) {
  return (
    <div
      data-testid='board-subgoal'
      class='flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/45'
    >
      {props.leading}
      <button type='button' class='min-w-0 flex-1 text-left' onClick={() => props.onOpen()}>
        <div class='text-[15px] leading-6 wrap-break-word'>{props.subgoal.title}</div>
        <div class='text-xs text-muted-foreground'>
          <Show when={props.showGoal}>{props.goal.document.title} · </Show>
          {KIND_LABELS[props.subgoal.kind]}
        </div>
      </button>
      {props.trailing}
    </div>
  )
}

export function GoalsBoardPane(props: GoalsBoardPaneProps) {
  const queryClient = useQueryClient()
  const today = useToday()
  const [filter, setFilter] = createSignal<Filter>('today')
  const [newTitle, setNewTitle] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)

  const goalsQuery = useQuery(() => ({
    queryKey: queryKeys.goals(),
    queryFn: () => api<GoalsResponse>('/api/goals'),
  }))

  const editable = () => goalsQuery.data?.editable === true
  const goals = createMemo(() =>
    (goalsQuery.data?.goals ?? [])
      .map((entry) =>
        parseEntry({ path: entry.path, content: entry.content, version: entry.version }),
      )
      .filter((goal) => goal !== null),
  )

  function open(path: string) {
    props.onNavigate?.(path)
  }

  async function mutateGoal(path: string, mutate: (document: GoalDocument) => void) {
    setError(null)
    try {
      await enqueueTextDocumentSave(createTextDocumentTarget(path), async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const entry = queryClient
            .getQueryData<GoalsResponse>(queryKeys.goals())
            ?.goals.find((candidate) => candidate.path === path)
          if (!entry) return
          const document = parseGoalDocument(entry.content, goalTitleFromPath(path))
          mutate(document)
          const content = serializeGoalDocument(document)
          try {
            const result = await post<{ version: string }>('/api/files/edit', {
              path,
              content,
              expectedHash: entry.version,
            })
            queryClient.setQueryData<GoalsResponse>(queryKeys.goals(), (old) =>
              old
                ? {
                    ...old,
                    goals: old.goals.map((goal) =>
                      goal.path === path ? { ...goal, content, version: result.version } : goal,
                    ),
                  }
                : old,
            )
            queryClient.setQueryData(queryKeys.textContent(path), {
              content,
              version: result.version,
            })
            return
          } catch (cause) {
            if (!isApiError(cause) || cause.status !== 409) throw cause
            await queryClient.refetchQueries({ queryKey: queryKeys.goals() })
          }
        }
        throw new Error('The goal keeps changing elsewhere. Try again.')
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save')
    }
  }

  const mutateSubgoal = (goal: Goal, id: string) => (mutate: (subgoal: Subgoal) => void) =>
    void mutateGoal(goal.path, (document) => {
      const subgoal = document.subgoals.find((candidate) => candidate.id === id)
      if (subgoal) mutate(subgoal)
    })

  async function createGoal() {
    const title = newTitle().trim()
    const folder = goalsQuery.data?.folder
    if (!title || !folder) return
    setError(null)
    const content = serializeGoalDocument({ version: 1, title, subgoals: [] })
    const fileName = goalFileName(title)
    const base = fileName.slice(0, -'.goal.json'.length)
    for (let index = 1; index < 50; index++) {
      const path = `${folder}/${index === 1 ? fileName : `${base} ${index}.goal.json`}`
      try {
        await post('/api/files/create', { path, content })
        setNewTitle('')
        await queryClient.invalidateQueries({ queryKey: queryKeys.goals() })
        open(path)
        return
      } catch (cause) {
        if (isApiError(cause) && cause.status === 409) continue
        setError(cause instanceof Error ? cause.message : 'Failed to create the goal')
        return
      }
    }
  }

  const todayRows = createMemo(() =>
    goals()
      .map((goal) => ({
        goal,
        subgoals: goal.document.subgoals.filter((subgoal) => relevantToday(subgoal, today())),
      }))
      .filter((group) => group.subgoals.length > 0),
  )
  const generalRows = createMemo(() =>
    goals().flatMap((goal) =>
      goal.document.subgoals
        .filter((subgoal) => subgoal.kind === 'general')
        .map((subgoal) => ({ goal, subgoal })),
    ),
  )
  const dailyRows = createMemo(() =>
    goals().flatMap((goal) =>
      goal.document.subgoals
        .filter((subgoal) => subgoal.kind === 'daily')
        .map((subgoal) => ({ goal, subgoal })),
    ),
  )

  function nextPlanned(document: GoalDocument): string | null {
    const todayKey = dayKey(today())
    let best: { key: string; title: string } | null = null
    for (const subgoal of document.subgoals) {
      for (const [key, mark] of Object.entries(subgoal.days)) {
        if (mark !== 'planned' || key < todayKey) continue
        if (!best || key < best.key) best = { key, title: subgoal.title }
      }
    }
    if (!best) return null
    const [year, month, day] = best.key.split('-').map(Number)
    const date = new Date(year!, month! - 1, day!)
    const label =
      best.key === todayKey
        ? 'today'
        : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    return `Next: ${best.title}, ${label}`
  }

  const todayCircle = (goal: Goal, subgoal: Subgoal) => {
    const state = () => dayState(subgoal, today(), today())
    return (
      <button
        type='button'
        aria-label={state() === 'done' ? 'Undo today' : 'Done today'}
        data-state={state()}
        disabled={!editable()}
        class={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-all',
          state() === 'done'
            ? 'bg-primary text-primary-foreground'
            : state() === 'planned'
              ? 'ring-2 ring-primary/70 ring-inset hover:bg-primary/10'
              : 'bg-muted/70 hover:bg-muted',
        )}
        onClick={() =>
          mutateSubgoal(
            goal,
            subgoal.id,
          )((target) => {
            const key = dayKey(today())
            if (target.days[key] === 'done') {
              if (target.kind === 'daily') delete target.days[key]
              else target.days[key] = 'planned'
            } else target.days[key] = 'done'
          })
        }
      >
        <Show when={state() === 'done'}>
          <Check class='size-3' stroke-width={3} aria-hidden='true' />
        </Show>
      </button>
    )
  }

  return (
    <PlannerChrome
      testId='goals-board'
      labelledBy='goals-board-title'
      embedded={props.embedded}
      showClose={props.showClose}
      onClose={() => (props.onClose ? props.onClose() : closeViewer())}
    >
      <header class='mb-5 px-1'>
        <h1 id='goals-board-title' class='text-[28px] leading-tight font-semibold tracking-tight'>
          Goals
        </h1>
        <p class='mt-1 text-sm text-muted-foreground'>
          {today().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </header>

      <div
        role='tablist'
        aria-label='Filter'
        class='mb-5 grid h-9 grid-cols-4 items-center rounded-xl bg-muted/60 p-0.5'
      >
        <For each={FILTERS}>
          {(item) => (
            <button
              type='button'
              role='tab'
              aria-selected={filter() === item.id ? 'true' : 'false'}
              class={cn(
                'h-8 rounded-[10px] text-[13px] font-medium transition-all',
                filter() === item.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <Show when={error()}>
        <p class='mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400'>
          {error()}
        </p>
      </Show>
      <Show when={goalsQuery.isError}>
        <p class='text-sm text-red-500'>Failed to load goals.</p>
      </Show>
      <Show when={goalsQuery.isPending}>
        <p class='px-1 text-sm text-muted-foreground'>Loading…</p>
      </Show>

      <Show when={filter() === 'all'}>
        <Show when={editable()}>
          <form
            class='mb-3 flex h-11 items-center gap-3 rounded-xl bg-muted/50 px-3 transition-colors focus-within:bg-muted/70'
            onSubmit={(event) => {
              event.preventDefault()
              void createGoal()
            }}
          >
            <Plus class='size-5 text-muted-foreground' stroke-width={2} aria-hidden='true' />
            <input
              aria-label='New goal'
              placeholder='New goal'
              class='min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70'
              value={newTitle()}
              onInput={(event) => setNewTitle(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </form>
        </Show>
        <div class='space-y-2'>
          <For each={goals()}>
            {(goal) => {
              const progress = () => goalProgress(goal.document, today())
              return (
                <button
                  type='button'
                  data-testid='board-goal'
                  class='flex w-full items-center gap-4 rounded-2xl bg-muted/35 px-4 py-3.5 text-left transition-colors hover:bg-muted/55'
                  onClick={() => open(goal.path)}
                >
                  <div class='relative text-primary'>
                    <ProgressRing value={progress() ?? 0} size={40} stroke={3.5} />
                    <span class='absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground tabular-nums'>
                      <Show when={progress() !== null} fallback='–'>
                        {Math.round(progress()! * 100)}
                      </Show>
                    </span>
                  </div>
                  <div class='min-w-0 flex-1'>
                    <div class='text-[16px] leading-6 font-semibold wrap-break-word'>
                      {goal.document.title}
                    </div>
                    <div class='text-xs text-muted-foreground'>
                      {goal.document.subgoals.length}{' '}
                      {goal.document.subgoals.length === 1 ? 'subgoal' : 'subgoals'}
                      <Show when={nextPlanned(goal.document)}>{(next) => <> · {next()}</>}</Show>
                    </div>
                  </div>
                  <ChevronRight
                    class='size-4 text-muted-foreground'
                    stroke-width={2}
                    aria-hidden='true'
                  />
                </button>
              )
            }}
          </For>
        </div>
        <Show when={goalsQuery.isSuccess && goals().length === 0}>
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>
            No goals yet. Start with one big goal, like “Health”.
          </p>
        </Show>
      </Show>

      <Show when={filter() === 'today'}>
        <div class='space-y-4'>
          <For each={todayRows()}>
            {(group) => (
              <section>
                <button
                  type='button'
                  class='mb-1 inline-flex items-center gap-0.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground'
                  onClick={() => open(group.goal.path)}
                >
                  {group.goal.document.title}
                  <ChevronRight class='size-3.5' stroke-width={2} aria-hidden='true' />
                </button>
                <For each={group.subgoals}>
                  {(subgoal) => (
                    <SubgoalRow
                      goal={group.goal}
                      subgoal={subgoal}
                      showGoal={false}
                      leading={todayCircle(group.goal, subgoal)}
                      onOpen={() => open(group.goal.path)}
                    />
                  )}
                </For>
              </section>
            )}
          </For>
        </div>
        <Show when={goalsQuery.isSuccess && todayRows().length === 0}>
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>
            Nothing planned for today.
          </p>
        </Show>
      </Show>

      <Show when={filter() === 'general'}>
        <For each={generalRows()}>
          {(row) => (
            <SubgoalRow
              goal={row.goal}
              subgoal={row.subgoal}
              showGoal
              leading={
                <TodoCheck
                  checked={row.subgoal.done === true}
                  disabled={!editable()}
                  label={row.subgoal.done ? 'Mark as not done' : 'Mark as done'}
                  onToggle={() =>
                    mutateSubgoal(
                      row.goal,
                      row.subgoal.id,
                    )((target) => {
                      target.done = !target.done
                    })
                  }
                />
              }
              trailing={
                <Show when={row.subgoal.deadline}>
                  <span class='shrink-0 text-xs text-muted-foreground'>
                    {deadlineLabel(row.subgoal.deadline, today())}
                  </span>
                </Show>
              }
              onOpen={() => open(row.goal.path)}
            />
          )}
        </For>
        <Show when={goalsQuery.isSuccess && generalRows().length === 0}>
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>
            No general subgoals — steps without dates show up here.
          </p>
        </Show>
      </Show>

      <Show when={filter() === 'daily'}>
        <div class='space-y-2'>
          <For each={dailyRows()}>
            {(row) => (
              <div class='rounded-2xl bg-muted/35 px-4 py-3' data-testid='board-daily'>
                <div class='mb-2 flex items-center gap-3'>
                  <button
                    type='button'
                    class='min-w-0 flex-1 text-left'
                    onClick={() => open(row.goal.path)}
                  >
                    <div class='text-[15px] leading-6 font-medium wrap-break-word'>
                      {row.subgoal.title}
                    </div>
                    <div class='text-xs text-muted-foreground'>{row.goal.document.title}</div>
                  </button>
                  <Show when={streak(row.subgoal, today()) > 1}>
                    <span class='inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-orange-500'>
                      <Flame class='size-3.5' stroke-width={2} aria-hidden='true' />
                      {streak(row.subgoal, today())} days
                    </span>
                  </Show>
                </div>
                <GoalWeekStrip
                  compact
                  subgoal={row.subgoal}
                  today={today()}
                  editable={editable()}
                  onChange={mutateSubgoal(row.goal, row.subgoal.id)}
                />
              </div>
            )}
          </For>
        </div>
        <Show when={goalsQuery.isSuccess && dailyRows().length === 0}>
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>No daily subgoals yet.</p>
        </Show>
      </Show>
    </PlannerChrome>
  )
}
