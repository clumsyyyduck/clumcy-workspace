import AlignLeft from 'lucide-solid/icons/align-left'
import BellRing from 'lucide-solid/icons/bell-ring'
import Bell from 'lucide-solid/icons/bell'
import CalendarClock from 'lucide-solid/icons/calendar-clock'
import Check from 'lucide-solid/icons/check'
import Info from 'lucide-solid/icons/info'
import ListChecks from 'lucide-solid/icons/list-checks'
import Plus from 'lucide-solid/icons/plus'
import Trash2 from 'lucide-solid/icons/trash-2'
import X from 'lucide-solid/icons/x'
import { For, Show, createMemo, createSignal } from 'solid-js'
import { cn } from '@/lib/ui/cn'
import { TodoCalendarPopover } from './TodoCalendar'
import { WrappingTextInput } from './WrappingTextInput'
import { formatDue, newTodoId, parseDue, reminderActive, type TodoTask } from './todo-model'

type Props = {
  task: TodoTask
  now: number
  editable: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onChange: (mutate: (task: TodoTask) => void) => void
  onDelete: () => void
}

function stopNavigationKeys(event: KeyboardEvent) {
  if (
    [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ].includes(event.key)
  )
    event.stopPropagation()
}

export function TodoCheck(props: {
  checked: boolean
  disabled?: boolean
  size?: 'md' | 'sm'
  class?: string
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={props.checked ? 'true' : 'false'}
      aria-label={props.label}
      disabled={props.disabled}
      class={cn(
        props.class,
        'inline-flex shrink-0 items-center justify-center border-[1.5px] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-default',
        props.size === 'sm' ? 'size-4 rounded-[5px]' : 'size-5 rounded-full',
        props.checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/35 hover:border-primary/70',
      )}
      onClick={(event) => {
        event.stopPropagation()
        props.onToggle()
      }}
    >
      <Show when={props.checked}>
        <Check
          class={props.size === 'sm' ? 'size-2.5' : 'size-3'}
          stroke-width={3}
          aria-hidden='true'
        />
      </Show>
    </button>
  )
}

export function TodoTaskRow(props: Props) {
  const [newItem, setNewItem] = createSignal('')
  const [calendarOpen, setCalendarOpen] = createSignal(false)
  const [dateButton, setDateButton] = createSignal<HTMLButtonElement | null>(null)

  const checklist = () => props.task.checklist ?? []
  const checklistDone = createMemo(() => checklist().filter((item) => item.done).length)
  const reminding = createMemo(() => reminderActive(props.task, props.now))
  const overdue = createMemo(() => {
    const due = parseDue(props.task.due)
    return !props.task.done && due !== null && due.getTime() < props.now
  })
  const hasMeta = createMemo(
    () => Boolean(props.task.due) || checklist().length > 0 || Boolean(props.task.description),
  )

  function addChecklistItem() {
    const text = newItem().trim()
    if (!text) return
    props.onChange((task) => {
      task.checklist = [...(task.checklist ?? []), { id: newTodoId(), text, done: false }]
    })
    setNewItem('')
  }

  return (
    <div
      data-testid='todo-task'
      data-task-id={props.task.id}
      class={cn(
        'group rounded-xl px-3 py-2.5 transition-colors duration-200',
        props.expanded
          ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_20px_-8px_rgba(0,0,0,0.12)] ring-1 ring-border/70'
          : 'hover:bg-muted/45',
      )}
    >
      <div class='flex items-start gap-3'>
        <div class='pt-0.5'>
          <TodoCheck
            checked={props.task.done}
            disabled={!props.editable}
            label={props.task.done ? 'Mark as not done' : 'Mark as done'}
            onToggle={() =>
              props.onChange((task) => {
                task.done = !task.done
                task.completedAt = task.done ? new Date().toISOString() : undefined
              })
            }
          />
        </div>
        <div class='min-w-0 flex-1'>
          <WrappingTextInput
            label='Task title'
            class={cn(
              'text-[15px] leading-6 transition-colors',
              props.task.done
                ? 'text-muted-foreground line-through decoration-1'
                : 'text-foreground',
            )}
            value={props.task.title}
            readonly={!props.editable}
            onInput={(title) =>
              props.onChange((task) => {
                task.title = title
              })
            }
            onBlur={(title) => {
              if (!title.trim()) props.onDelete()
            }}
          />
          <Show when={hasMeta() || reminding()}>
            <div class='mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
              <Show when={props.task.due}>
                <button
                  type='button'
                  class={cn(
                    'inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground',
                    overdue() && 'text-red-500 hover:text-red-500',
                  )}
                  onClick={() => props.onToggleExpanded()}
                >
                  <CalendarClock class='size-3.5' stroke-width={2} aria-hidden='true' />
                  {formatDue(props.task.due, new Date(props.now))}
                  <Show when={props.task.remind && !reminding()}>
                    <Bell class='size-3' stroke-width={2} aria-label='Reminder on' />
                  </Show>
                </button>
              </Show>
              <Show when={checklist().length > 0}>
                <span class='inline-flex items-center gap-1'>
                  <ListChecks class='size-3.5' stroke-width={2} aria-hidden='true' />
                  {checklistDone()}/{checklist().length}
                </span>
              </Show>
              <Show when={props.task.description && !props.expanded}>
                <AlignLeft class='size-3.5' stroke-width={2} aria-label='Has notes' />
              </Show>
              <Show when={reminding()}>
                <span
                  data-testid='todo-reminder'
                  class='inline-flex items-center gap-1.5 rounded-full bg-orange-500/12 py-0.5 pr-0.5 pl-2 font-medium text-orange-600 dark:text-orange-400'
                >
                  <BellRing class='size-3' stroke-width={2.25} aria-hidden='true' />
                  Starts soon
                  <Show when={props.editable}>
                    <button
                      type='button'
                      class='rounded-full bg-orange-500/15 px-2 py-px transition-colors hover:bg-orange-500/25'
                      onClick={() =>
                        props.onChange((task) => {
                          task.reminderAcknowledged = true
                        })
                      }
                    >
                      OK
                    </button>
                  </Show>
                </span>
              </Show>
            </div>
          </Show>
        </div>
        <button
          type='button'
          aria-label={props.expanded ? 'Hide details' : 'Show details'}
          aria-expanded={props.expanded ? 'true' : 'false'}
          class={cn(
            'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground',
            props.expanded
              ? 'text-primary opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          onClick={() => props.onToggleExpanded()}
        >
          <Info class='size-4' stroke-width={2} aria-hidden='true' />
        </button>
      </div>

      <Show when={props.expanded}>
        <div class='mt-3 space-y-4 pl-8'>
          <WrappingTextInput
            multiline
            label='Notes'
            placeholder='Notes'
            class='min-h-12 rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:bg-muted/70'
            value={props.task.description ?? ''}
            readonly={!props.editable}
            onInput={(description) =>
              props.onChange((task) => {
                task.description = description
              })
            }
          />

          <div class='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              ref={setDateButton}
              aria-label='Start date and time'
              aria-expanded={calendarOpen() ? 'true' : 'false'}
              disabled={!props.editable}
              class={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors disabled:cursor-default',
                calendarOpen() ? 'bg-primary/10 text-primary' : 'bg-muted/50 hover:bg-muted/70',
                !props.task.due && !calendarOpen() && 'text-muted-foreground',
              )}
              onClick={() => setCalendarOpen((open) => !open)}
            >
              <CalendarClock class='size-4' stroke-width={2} aria-hidden='true' />
              {props.task.due ? formatDue(props.task.due, new Date(props.now)) : 'Add date'}
            </button>

            <button
              type='button'
              role='switch'
              aria-checked={props.task.remind ? 'true' : 'false'}
              disabled={!props.editable || !props.task.due}
              class='inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent'
              onClick={() =>
                props.onChange((task) => {
                  task.remind = !task.remind
                  task.reminderAcknowledged = false
                })
              }
            >
              <span
                class={cn(
                  'relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-200',
                  props.task.remind ? 'bg-primary' : 'bg-muted-foreground/25',
                )}
              >
                <span
                  class={cn(
                    'absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-sm transition-transform duration-200',
                    props.task.remind && 'translate-x-3',
                  )}
                />
              </span>
              Remind 1 hour before
            </button>
          </div>

          <Show when={calendarOpen() && props.editable}>
            <TodoCalendarPopover
              anchor={dateButton}
              value={props.task.due}
              now={props.now}
              onChange={(due) =>
                props.onChange((task) => {
                  task.due = due
                  task.reminderAcknowledged = false
                  if (!due) task.remind = false
                })
              }
              onDone={() => setCalendarOpen(false)}
            />
          </Show>

          <div class='space-y-1'>
            <div class='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
              Checklist
            </div>
            <For each={checklist()}>
              {(item) => (
                <div class='group/item flex items-start gap-2.5 rounded-md py-1'>
                  <TodoCheck
                    class='mt-0.5'
                    size='sm'
                    checked={item.done}
                    disabled={!props.editable}
                    label={item.done ? 'Mark item as not done' : 'Mark item as done'}
                    onToggle={() =>
                      props.onChange((task) => {
                        const target = task.checklist?.find((entry) => entry.id === item.id)
                        if (target) target.done = !target.done
                      })
                    }
                  />
                  <WrappingTextInput
                    label='Checklist item'
                    class={cn(
                      'min-w-0 flex-1 text-sm leading-5',
                      item.done && 'text-muted-foreground line-through',
                    )}
                    value={item.text}
                    readonly={!props.editable}
                    onInput={(text) =>
                      props.onChange((task) => {
                        const target = task.checklist?.find((entry) => entry.id === item.id)
                        if (target) target.text = text
                      })
                    }
                  />
                  <Show when={props.editable}>
                    <button
                      type='button'
                      aria-label='Remove item'
                      class='inline-flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100'
                      onClick={() =>
                        props.onChange((task) => {
                          task.checklist = task.checklist?.filter((entry) => entry.id !== item.id)
                        })
                      }
                    >
                      <X class='size-3' stroke-width={2} aria-hidden='true' />
                    </button>
                  </Show>
                </div>
              )}
            </For>
            <Show when={props.editable}>
              <div class='flex items-center gap-2.5 py-1'>
                <Plus class='size-4 text-muted-foreground' stroke-width={2} aria-hidden='true' />
                <input
                  aria-label='New checklist item'
                  placeholder='Add item'
                  class='min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70'
                  value={newItem()}
                  onInput={(event) => setNewItem(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    stopNavigationKeys(event)
                    if (event.key === 'Enter') addChecklistItem()
                  }}
                  onBlur={addChecklistItem}
                />
              </div>
            </Show>
          </div>

          <Show when={props.editable}>
            <div class='flex justify-end'>
              <button
                type='button'
                class='inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500'
                onClick={() => props.onDelete()}
              >
                <Trash2 class='size-3.5' stroke-width={2} aria-hidden='true' />
                Delete task
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
