import CalendarPlus from 'lucide-solid/icons/calendar-plus'
import Check from 'lucide-solid/icons/check'
import ChevronLeft from 'lucide-solid/icons/chevron-left'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { TodoCalendar } from '@/features/todo/TodoCalendar'
import { dayKey, sameDay } from '@/features/todo/todo-model'
import { AnchoredPopover } from '@/lib/ui/AnchoredPopover'
import { cn } from '@/lib/ui/cn'
import { GoalPlanCalendar } from './GoalPlanCalendar'
import {
  dayState,
  moveDay,
  nextDayMark,
  setDayMark,
  weekDays,
  type DayMark,
  type Subgoal,
} from './goal-model'

type Props = {
  subgoal: Subgoal
  today: Date
  editable: boolean
  onChange: (mutate: (subgoal: Subgoal) => void) => void
  /** Board rows: just the current week, without navigation or planning. */
  compact?: boolean
}

type MenuState = { day: Date; anchor: HTMLElement; mode: 'actions' | 'move' }

const LONG_PRESS_MS = 500

const weekdayLabel = (day: Date) => day.toLocaleDateString(undefined, { weekday: 'short' })

const menuItemClass =
  'flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted'

export function GoalWeekStrip(props: Props) {
  const [offset, setOffset] = createSignal(0)
  const [menu, setMenu] = createSignal<MenuState | null>(null)
  const [planOpen, setPlanOpen] = createSignal(false)
  const [planButton, setPlanButton] = createSignal<HTMLButtonElement | null>(null)

  const days = createMemo(() => weekDays(props.today, props.compact ? 0 : offset()))
  const rangeLabel = createMemo(() => {
    const [first, last] = [days()[0]!, days()[6]!]
    const options = { day: 'numeric', month: 'short' } as const
    return `${first.toLocaleDateString(undefined, options)} – ${last.toLocaleDateString(undefined, options)}`
  })

  const mark = (day: Date): DayMark | undefined => props.subgoal.days[dayKey(day)]

  function apply(day: Date, next: DayMark | undefined) {
    props.onChange((subgoal) => setDayMark(subgoal, day, next))
  }

  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let pressOpened = false

  const openMenu = (day: Date, anchor: HTMLElement) => setMenu({ day, anchor, mode: 'actions' })

  return (
    <div class='select-none'>
      <Show when={!props.compact}>
        <div class='mb-1 flex items-center justify-between text-[11px] text-muted-foreground'>
          <span>{offset() === 0 ? 'This week' : rangeLabel()}</span>
          <Show when={offset() !== 0}>
            <button
              type='button'
              class='rounded-full px-2 py-0.5 font-medium text-primary hover:bg-muted'
              onClick={() => setOffset(0)}
            >
              Today
            </button>
          </Show>
        </div>
      </Show>

      <div class='flex items-center gap-1'>
        <Show when={!props.compact}>
          <button
            type='button'
            aria-label='Previous week'
            class='inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
            onClick={() => setOffset((value) => value - 1)}
          >
            <ChevronLeft class='size-4' stroke-width={2} aria-hidden='true' />
          </button>
        </Show>

        <div class='grid flex-1 grid-cols-7' data-testid='goal-week'>
          <For each={days()}>
            {(day) => {
              const state = () => dayState(props.subgoal, day, props.today)
              const isToday = () => sameDay(day, props.today)
              return (
                <div class='flex flex-col items-center gap-0.5'>
                  <span
                    class={cn(
                      'text-[11px] tabular-nums',
                      isToday() ? 'font-semibold text-orange-500' : 'text-muted-foreground',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <button
                    type='button'
                    data-day={dayKey(day)}
                    data-state={state()}
                    aria-label={`${day.toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}: ${state()}`}
                    disabled={!props.editable}
                    class={cn(
                      'inline-flex items-center justify-center rounded-full transition-all duration-150 disabled:cursor-default',
                      props.compact ? 'size-5' : 'size-6',
                      state() === 'done' && 'bg-primary text-primary-foreground',
                      state() === 'planned' &&
                        'ring-2 ring-primary/70 ring-inset hover:bg-primary/10',
                      state() === 'missed' && 'bg-red-500/10 ring-2 ring-red-500/35 ring-inset',
                      state() === 'empty' && 'bg-muted/70 hover:bg-muted',
                      isToday() && 'outline-[1.5px] outline-offset-1 outline-orange-400/70',
                    )}
                    onClick={() => {
                      if (pressOpened) {
                        pressOpened = false
                        return
                      }
                      apply(day, nextDayMark(props.subgoal, day))
                    }}
                    onContextMenu={(event) => {
                      if (!props.editable) return
                      event.preventDefault()
                      openMenu(day, event.currentTarget)
                    }}
                    onPointerDown={(event) => {
                      if (!props.editable || event.pointerType === 'mouse') return
                      const anchor = event.currentTarget
                      pressTimer = setTimeout(() => {
                        pressOpened = true
                        openMenu(day, anchor)
                      }, LONG_PRESS_MS)
                    }}
                    onPointerUp={() => {
                      if (pressTimer) clearTimeout(pressTimer)
                    }}
                    onPointerLeave={() => {
                      if (pressTimer) clearTimeout(pressTimer)
                    }}
                  >
                    <Show when={state() === 'done'}>
                      <Check
                        class={props.compact ? 'size-2.5' : 'size-3.5'}
                        stroke-width={3}
                        aria-hidden='true'
                      />
                    </Show>
                  </button>
                  <span
                    class={cn(
                      'text-[10px] uppercase',
                      day.getDay() === 0 || day.getDay() === 6
                        ? 'text-muted-foreground/55'
                        : 'text-muted-foreground',
                    )}
                  >
                    {weekdayLabel(day)}
                  </span>
                </div>
              )
            }}
          </For>
        </div>

        <Show when={!props.compact}>
          <button
            type='button'
            aria-label='Next week'
            class='inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
            onClick={() => setOffset((value) => value + 1)}
          >
            <ChevronRight class='size-4' stroke-width={2} aria-hidden='true' />
          </button>
          <Show when={props.subgoal.kind === 'planned' && props.editable}>
            <button
              type='button'
              ref={setPlanButton}
              aria-label='Plan days'
              aria-expanded={planOpen() ? 'true' : 'false'}
              class={cn(
                'ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
                planOpen()
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => setPlanOpen((open) => !open)}
            >
              <CalendarPlus class='size-4' stroke-width={2} aria-hidden='true' />
            </button>
          </Show>
        </Show>
      </div>

      <Show when={planOpen()}>
        <AnchoredPopover anchor={planButton} onDismiss={() => setPlanOpen(false)}>
          <GoalPlanCalendar
            subgoal={props.subgoal}
            today={props.today}
            onToggle={(day) =>
              props.onChange((subgoal) =>
                setDayMark(subgoal, day, subgoal.days[dayKey(day)] ? undefined : 'planned'),
              )
            }
            onDone={() => setPlanOpen(false)}
          />
        </AnchoredPopover>
      </Show>

      <Show when={menu()} keyed>
        {(state) => (
          <AnchoredPopover anchor={() => state.anchor} onDismiss={() => setMenu(null)}>
            <Show
              when={state.mode === 'actions'}
              fallback={
                <TodoCalendar
                  value={dayKey(state.day)}
                  now={props.today.getTime()}
                  withTime={false}
                  onChange={(value) => {
                    if (!value) return
                    const [year, month, date] = value.split('-').map(Number)
                    props.onChange((subgoal) =>
                      moveDay(subgoal, state.day, new Date(year!, month! - 1, date!)),
                    )
                    setMenu(null)
                  }}
                  onDone={() => setMenu(null)}
                />
              }
            >
              <div
                role='menu'
                data-testid='goal-day-menu'
                class='min-w-44 rounded-xl bg-popover p-1 text-popover-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1 ring-border/70'
              >
                <div class='px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground'>
                  {state.day.toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
                <Show
                  when={mark(state.day) === 'done'}
                  fallback={
                    <button
                      type='button'
                      role='menuitem'
                      class={menuItemClass}
                      onClick={() => {
                        apply(state.day, 'done')
                        setMenu(null)
                      }}
                    >
                      Mark done
                    </button>
                  }
                >
                  <button
                    type='button'
                    role='menuitem'
                    class={menuItemClass}
                    onClick={() => {
                      apply(state.day, props.subgoal.kind === 'daily' ? undefined : 'planned')
                      setMenu(null)
                    }}
                  >
                    Undo done
                  </button>
                </Show>
                <Show when={!mark(state.day) && props.subgoal.kind !== 'daily'}>
                  <button
                    type='button'
                    role='menuitem'
                    class={menuItemClass}
                    onClick={() => {
                      apply(state.day, 'planned')
                      setMenu(null)
                    }}
                  >
                    Plan this day
                  </button>
                </Show>
                <Show when={mark(state.day) === 'planned'}>
                  <button
                    type='button'
                    role='menuitem'
                    class={menuItemClass}
                    onClick={() => setMenu({ ...state, mode: 'move' })}
                  >
                    Move to…
                  </button>
                </Show>
                <Show when={mark(state.day)}>
                  <button
                    type='button'
                    role='menuitem'
                    class={cn(menuItemClass, 'text-red-500 hover:bg-red-500/10')}
                    onClick={() => {
                      apply(state.day, undefined)
                      setMenu(null)
                    }}
                  >
                    {mark(state.day) === 'done' ? 'Clear' : 'Remove plan'}
                  </button>
                </Show>
              </div>
            </Show>
          </AnchoredPopover>
        )}
      </Show>
    </div>
  )
}
