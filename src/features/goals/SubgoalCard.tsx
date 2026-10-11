import AlignLeft from 'lucide-solid/icons/align-left'
import CalendarClock from 'lucide-solid/icons/calendar-clock'
import Flame from 'lucide-solid/icons/flame'
import Info from 'lucide-solid/icons/info'
import ListChecks from 'lucide-solid/icons/list-checks'
import Minus from 'lucide-solid/icons/minus'
import Plus from 'lucide-solid/icons/plus'
import Trash2 from 'lucide-solid/icons/trash-2'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { ChecklistEditor } from '@/features/todo/ChecklistEditor'
import { TodoCalendarPopover } from '@/features/todo/TodoCalendar'
import { TodoCheck } from '@/features/todo/TodoCheck'
import { NotesField } from '@/features/todo/NotesField'
import { WrappingTextInput } from '@/features/todo/WrappingTextInput'
import { parseDue } from '@/features/todo/todo-model'
import { cn } from '@/lib/ui/cn'
import { GoalWeekStrip } from './GoalWeekStrip'
import { ProgressRing } from './ProgressRing'
import {
  daysUntil,
  streak,
  weekDays,
  weekProgress,
  type Subgoal,
  type SubgoalKind,
} from './goal-model'

type Props = {
  subgoal: Subgoal
  today: Date
  editable: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onChange: (mutate: (subgoal: Subgoal) => void) => void
  onDelete: () => void
}

export const KIND_LABELS: Record<SubgoalKind, string> = {
  general: 'General',
  daily: 'Daily',
  planned: 'Planned',
}

const KINDS: SubgoalKind[] = ['general', 'daily', 'planned']

export function deadlineLabel(deadline: string | undefined, today: Date): string {
  const date = parseDue(deadline)
  const left = daysUntil(deadline, today)
  if (!date || left === null) return ''
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  if (left === 0) return `${day} · today`
  if (left < 0) return `${day} · ${-left} d overdue`
  return `${day} · ${left} d left`
}

export function SubgoalCard(props: Props) {
  const [deadlineOpen, setDeadlineOpen] = createSignal(false)
  const [deadlineButton, setDeadlineButton] = createSignal<HTMLButtonElement | null>(null)

  const checklist = () => props.subgoal.checklist ?? []
  const checklistDone = createMemo(() => checklist().filter((item) => item.done).length)
  const progress = createMemo(() =>
    props.subgoal.kind === 'general'
      ? null
      : weekProgress(props.subgoal, weekDays(props.today), props.today),
  )
  const currentStreak = createMemo(() =>
    props.subgoal.kind === 'daily' ? streak(props.subgoal, props.today) : 0,
  )
  const overdue = createMemo(() => (daysUntil(props.subgoal.deadline, props.today) ?? 0) < 0)

  return (
    <div
      data-testid='subgoal'
      data-subgoal-id={props.subgoal.id}
      class={cn(
        'group rounded-2xl px-4 py-3 transition-colors duration-200',
        props.expanded
          ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_20px_-8px_rgba(0,0,0,0.12)] ring-1 ring-border/70'
          : 'bg-muted/35 hover:bg-muted/50',
      )}
    >
      <div class='flex items-start gap-3'>
        <Show when={props.subgoal.kind === 'general'}>
          <div class='pt-0.5'>
            <TodoCheck
              checked={props.subgoal.done === true}
              disabled={!props.editable}
              label={props.subgoal.done ? 'Mark as not done' : 'Mark as done'}
              onToggle={() =>
                props.onChange((subgoal) => {
                  subgoal.done = !subgoal.done
                })
              }
            />
          </div>
        </Show>
        <div class='min-w-0 flex-1'>
          <WrappingTextInput
            label='Subgoal title'
            class={cn(
              'text-[15px] leading-6 font-medium',
              props.subgoal.kind === 'general' &&
                props.subgoal.done &&
                'text-muted-foreground line-through',
            )}
            value={props.subgoal.title}
            readonly={!props.editable}
            onInput={(title) =>
              props.onChange((subgoal) => {
                subgoal.title = title
              })
            }
          />
          <div class='mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
            <span>{KIND_LABELS[props.subgoal.kind]}</span>
            <Show when={progress()} keyed>
              {(value) => (
                <Show when={value.target > 0}>
                  <span class='inline-flex items-center gap-1 text-foreground/80'>
                    <ProgressRing
                      value={value.done / value.target}
                      size={13}
                      stroke={2}
                      class='text-primary'
                    />
                    {value.done}/{value.target}
                    <Show when={props.subgoal.kind === 'planned' && props.subgoal.weeklyTarget}>
                      {' '}
                      this week
                    </Show>
                  </span>
                </Show>
              )}
            </Show>
            <Show when={currentStreak() > 1}>
              <span class='inline-flex items-center gap-0.5 font-medium text-orange-500'>
                <Flame class='size-3.5' stroke-width={2} aria-hidden='true' />
                {currentStreak()} days
              </span>
            </Show>
            <Show when={props.subgoal.deadline}>
              <span class={cn('inline-flex items-center gap-1', overdue() && 'text-red-500')}>
                <CalendarClock class='size-3.5' stroke-width={2} aria-hidden='true' />
                {deadlineLabel(props.subgoal.deadline, props.today)}
              </span>
            </Show>
            <Show when={checklist().length > 0}>
              <span class='inline-flex items-center gap-1'>
                <ListChecks class='size-3.5' stroke-width={2} aria-hidden='true' />
                {checklistDone()}/{checklist().length}
              </span>
            </Show>
            <Show when={props.subgoal.description && !props.expanded}>
              <AlignLeft class='size-3.5' stroke-width={2} aria-label='Has notes' />
            </Show>
          </div>
        </div>
        <button
          type='button'
          aria-label={props.expanded ? 'Hide details' : 'Show details'}
          aria-expanded={props.expanded ? 'true' : 'false'}
          class={cn(
            'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground',
            props.expanded ? 'text-primary opacity-100' : 'opacity-60 group-hover:opacity-100',
          )}
          onClick={() => props.onToggleExpanded()}
        >
          <Info class='size-4' stroke-width={2} aria-hidden='true' />
        </button>
      </div>

      <Show when={props.subgoal.kind !== 'general'}>
        <div class='mt-3'>
          <GoalWeekStrip
            subgoal={props.subgoal}
            today={props.today}
            editable={props.editable}
            onChange={props.onChange}
          />
        </div>
      </Show>

      <Show when={props.expanded}>
        <div class='mt-4 space-y-4 border-t border-border/60 pt-4'>
          <NotesField
            label='Notes'
            placeholder='Notes'
            class='min-h-12 rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:bg-muted/70'
            value={props.subgoal.description ?? ''}
            readonly={!props.editable}
            onInput={(description) =>
              props.onChange((subgoal) => {
                subgoal.description = description
              })
            }
          />

          <div class='flex flex-wrap items-center gap-2'>
            <div
              role='radiogroup'
              aria-label='Kind'
              class='inline-flex h-8 items-center rounded-lg bg-muted/60 p-0.5'
            >
              <For each={KINDS}>
                {(kind) => (
                  <button
                    type='button'
                    role='radio'
                    aria-checked={props.subgoal.kind === kind ? 'true' : 'false'}
                    disabled={!props.editable}
                    class={cn(
                      'h-7 rounded-md px-2.5 text-xs font-medium transition-all',
                      props.subgoal.kind === kind
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() =>
                      props.onChange((subgoal) => {
                        subgoal.kind = kind
                      })
                    }
                  >
                    {KIND_LABELS[kind]}
                  </button>
                )}
              </For>
            </div>

            <Show when={props.subgoal.kind === 'planned'}>
              <div class='inline-flex h-8 items-center gap-1 rounded-lg bg-muted/50 px-1.5 text-xs'>
                <button
                  type='button'
                  aria-label='Fewer times a week'
                  disabled={!props.editable || !props.subgoal.weeklyTarget}
                  class='inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'
                  onClick={() =>
                    props.onChange((subgoal) => {
                      const next = (subgoal.weeklyTarget ?? 1) - 1
                      subgoal.weeklyTarget = next >= 1 ? next : undefined
                    })
                  }
                >
                  <Minus class='size-3.5' stroke-width={2} aria-hidden='true' />
                </button>
                <span class='min-w-24 text-center tabular-nums' data-testid='weekly-target'>
                  {props.subgoal.weeklyTarget
                    ? `${props.subgoal.weeklyTarget}× a week`
                    : 'No weekly target'}
                </span>
                <button
                  type='button'
                  aria-label='More times a week'
                  disabled={!props.editable || (props.subgoal.weeklyTarget ?? 0) >= 7}
                  class='inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40'
                  onClick={() =>
                    props.onChange((subgoal) => {
                      subgoal.weeklyTarget = Math.min(7, (subgoal.weeklyTarget ?? 0) + 1)
                    })
                  }
                >
                  <Plus class='size-3.5' stroke-width={2} aria-hidden='true' />
                </button>
              </div>
            </Show>

            <button
              type='button'
              ref={setDeadlineButton}
              aria-label='Deadline'
              aria-expanded={deadlineOpen() ? 'true' : 'false'}
              disabled={!props.editable}
              class={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs transition-colors disabled:cursor-default',
                deadlineOpen() ? 'bg-primary/10 text-primary' : 'bg-muted/50 hover:bg-muted/70',
                !props.subgoal.deadline && !deadlineOpen() && 'text-muted-foreground',
              )}
              onClick={() => setDeadlineOpen((open) => !open)}
            >
              <CalendarClock class='size-4' stroke-width={2} aria-hidden='true' />
              {props.subgoal.deadline
                ? `Due ${deadlineLabel(props.subgoal.deadline, props.today)}`
                : 'Add deadline'}
            </button>
          </div>

          <Show when={deadlineOpen() && props.editable}>
            <TodoCalendarPopover
              anchor={deadlineButton}
              value={props.subgoal.deadline}
              now={props.today.getTime()}
              withTime={false}
              onChange={(deadline) =>
                props.onChange((subgoal) => {
                  subgoal.deadline = deadline
                })
              }
              onDone={() => setDeadlineOpen(false)}
            />
          </Show>

          <ChecklistEditor
            items={checklist()}
            editable={props.editable}
            onChange={props.onChange}
          />

          <Show when={props.editable}>
            <div class='flex justify-end'>
              <button
                type='button'
                class='inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500'
                onClick={() => props.onDelete()}
              >
                <Trash2 class='size-3.5' stroke-width={2} aria-hidden='true' />
                Delete subgoal
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
