import Check from 'lucide-solid/icons/check'
import ChevronLeft from 'lucide-solid/icons/chevron-left'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import { For, Show, createMemo, createSignal, untrack } from 'solid-js'
import { calendarDays, dayKey, sameDay } from '@/features/todo/todo-model'
import { cn } from '@/lib/ui/cn'
import { dayState, type Subgoal } from './goal-model'

type Props = {
  subgoal: Subgoal
  today: Date
  /** Plans an empty day or removes a plan; completed days stay as they are. */
  onToggle: (day: Date) => void
  onDone: () => void
}

const MONDAY = new Date(2024, 0, 1)
const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
  new Date(2024, 0, MONDAY.getDate() + index).toLocaleDateString(undefined, { weekday: 'short' }),
)

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

/** Month view for planning many future days of a subgoal at once. */
export function GoalPlanCalendar(props: Props) {
  const [month, setMonth] = createSignal(
    untrack(() => new Date(props.today.getFullYear(), props.today.getMonth(), 1)),
  )
  const days = createMemo(() => calendarDays(month()))
  const monthTitle = createMemo(() =>
    capitalize(month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
  )
  const plannedCount = createMemo(
    () =>
      Object.entries(props.subgoal.days).filter(
        ([key, mark]) => mark === 'planned' && key >= dayKey(props.today),
      ).length,
  )

  const shiftMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))

  return (
    <div
      data-testid='goal-plan-calendar'
      class='w-[244px] rounded-xl bg-card p-2.5 text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1 ring-border/70'
      onKeyDown={(event) => {
        if (event.key.startsWith('Arrow')) event.stopPropagation()
      }}
    >
      <div class='mb-1.5 flex items-center justify-between pl-1.5'>
        <span class='text-[13px] font-semibold tracking-tight'>{monthTitle()}</span>
        <div class='flex items-center'>
          <button
            type='button'
            aria-label='Previous month'
            class='inline-flex size-6 items-center justify-center rounded-full text-primary hover:bg-muted'
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft class='size-3.5' stroke-width={2.25} aria-hidden='true' />
          </button>
          <button
            type='button'
            aria-label='Next month'
            class='inline-flex size-6 items-center justify-center rounded-full text-primary hover:bg-muted'
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight class='size-3.5' stroke-width={2.25} aria-hidden='true' />
          </button>
        </div>
      </div>

      <div class='grid grid-cols-7 pb-1' aria-hidden='true'>
        <For each={weekdayLabels}>
          {(label, index) => (
            <span
              class={cn(
                'text-center text-[10px] font-medium uppercase',
                index() >= 5 ? 'text-muted-foreground/55' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          )}
        </For>
      </div>

      <div class='grid grid-cols-7 gap-y-px' role='grid' aria-label={monthTitle()}>
        <For each={days()}>
          {(day) => {
            const state = () => dayState(props.subgoal, day, props.today)
            const outside = () => day.getMonth() !== month().getMonth()
            const isToday = () => sameDay(day, props.today)
            return (
              <button
                type='button'
                role='gridcell'
                aria-selected={state() === 'planned' || state() === 'done' ? 'true' : 'false'}
                aria-label={day.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                disabled={state() === 'done'}
                class={cn(
                  'mx-auto inline-flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors duration-150 disabled:cursor-default',
                  state() === 'done' && 'bg-primary text-primary-foreground',
                  state() === 'planned' &&
                    'font-semibold text-primary ring-[1.5px] ring-primary/70 ring-inset',
                  state() === 'missed' && 'text-red-500/80 ring-[1.5px] ring-red-500/40 ring-inset',
                  state() === 'empty' &&
                    (outside() ? 'text-muted-foreground/40 hover:bg-muted/60' : 'hover:bg-muted'),
                  state() === 'empty' && isToday() && 'font-semibold text-orange-500',
                )}
                onClick={() => props.onToggle(day)}
              >
                <Show when={state() === 'done'} fallback={day.getDate()}>
                  <Check class='size-3.5' stroke-width={3} aria-hidden='true' />
                </Show>
              </button>
            )
          }}
        </For>
      </div>

      <div class='mt-2 flex items-center justify-between border-t border-border/60 pt-2'>
        <span class='pl-1 text-[11px] text-muted-foreground'>{plannedCount()} planned ahead</span>
        <button
          type='button'
          class='rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90'
          onClick={() => props.onDone()}
        >
          Done
        </button>
      </div>
    </div>
  )
}
