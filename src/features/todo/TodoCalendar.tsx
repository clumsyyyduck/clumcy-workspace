import ChevronLeft from 'lucide-solid/icons/chevron-left'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import Clock from 'lucide-solid/icons/clock'
import { For, createEffect, createMemo, createSignal, untrack, type Accessor } from 'solid-js'
import { Portal } from '@solidjs/web'
import { clampFixedMenuPosition } from '@/lib/ui/clamp-fixed-menu'
import { cn } from '@/lib/ui/cn'
import {
  floatingPointerInsideSurface,
  registerFloatingDismissLayer,
} from '@/lib/ui/floating-layer-registry'
import { FLOATING_Z_PLAYBACK_MENU } from '@/lib/ui/floating-z-index'
import { calendarDays, composeDue, dueTime, parseDue, sameDay } from './todo-model'

type Props = {
  value: string | undefined
  now: number
  onChange: (due: string | undefined) => void
  onDone: () => void
}

const MONDAY = new Date(2024, 0, 1)

const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
  new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + index).toLocaleDateString(
    undefined,
    { weekday: 'short' },
  ),
)

const relativeDay = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function capitalize(text: string) {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const chipClass =
  'inline-flex h-6 items-center rounded-full bg-muted/60 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted'

export function TodoCalendar(props: Props) {
  const selected = createMemo(() => parseDue(props.value))
  const today = createMemo(() => new Date(props.now))
  const [month, setMonth] = createSignal(
    untrack(() => startOfMonth(selected() ?? new Date(props.now))),
  )

  const days = createMemo(() => calendarDays(month()))
  const monthTitle = createMemo(() =>
    capitalize(month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
  )
  const time = createMemo(() => dueTime(props.value))

  function pick(day: Date) {
    props.onChange(composeDue(day, time()))
    if (day.getMonth() !== month().getMonth()) setMonth(startOfMonth(day))
  }

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  return (
    <div
      data-testid='todo-calendar'
      class='w-[244px] rounded-xl bg-card p-2.5 text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_32px_-12px_rgba(0,0,0,0.25)] ring-1 ring-border/70'
      onKeyDown={(event) => {
        if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')
          event.stopPropagation()
        if (event.key === 'Escape') {
          event.stopPropagation()
          props.onDone()
        }
      }}
    >
      <div class='mb-1.5 flex items-center justify-between pl-1.5'>
        <span class='text-[13px] font-semibold tracking-tight' aria-live='polite'>
          {monthTitle()}
        </span>
        <div class='flex items-center'>
          <button
            type='button'
            aria-label='Previous month'
            class='inline-flex size-6 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted'
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft class='size-3.5' stroke-width={2.25} aria-hidden='true' />
          </button>
          <button
            type='button'
            aria-label='Next month'
            class='inline-flex size-6 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted'
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
            const isSelected = () => {
              const value = selected()
              return value !== null && sameDay(value, day)
            }
            const isToday = () => sameDay(today(), day)
            const outside = () => day.getMonth() !== month().getMonth()
            return (
              <button
                type='button'
                role='gridcell'
                aria-selected={isSelected() ? 'true' : 'false'}
                aria-label={day.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                class={cn(
                  'mx-auto inline-flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors duration-150',
                  isSelected()
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : isToday()
                      ? 'font-semibold text-orange-500 hover:bg-muted'
                      : outside()
                        ? 'text-muted-foreground/40 hover:bg-muted/60'
                        : 'text-foreground hover:bg-muted',
                )}
                onClick={() => pick(day)}
              >
                {day.getDate()}
              </button>
            )
          }}
        </For>
      </div>

      <div class='mt-2 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2'>
        <button type='button' class={chipClass} onClick={() => pick(today())}>
          {capitalize(relativeDay.format(0, 'day'))}
        </button>
        <button type='button' class={chipClass} onClick={() => pick(addDays(today(), 1))}>
          {capitalize(relativeDay.format(1, 'day'))}
        </button>
        <label class='ml-auto inline-flex h-6 items-center gap-1 rounded-full bg-muted/60 pr-1.5 pl-2 text-[11px]'>
          <Clock class='size-3 text-muted-foreground' stroke-width={2} aria-hidden='true' />
          <input
            type='time'
            aria-label='Start time'
            class='bg-transparent text-[11px] font-medium text-foreground tabular-nums outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden'
            value={time()}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (!value) return
              props.onChange(composeDue(selected() ?? today(), value))
            }}
          />
        </label>
      </div>

      <div class='mt-1.5 flex items-center justify-between'>
        <button
          type='button'
          disabled={!props.value}
          class='rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-0'
          onClick={() => props.onChange(undefined)}
        >
          Clear
        </button>
        <button
          type='button'
          class='rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90'
          onClick={() => props.onDone()}
        >
          Done
        </button>
      </div>
    </div>
  )
}

const ANCHOR_GAP = 6

/**
 * Floats the calendar over the page next to its trigger: below it when there is room on
 * screen, otherwise above, always kept clear of the viewport edges.
 */
export function TodoCalendarPopover(props: Props & { anchor: Accessor<HTMLElement | null> }) {
  const [surface, setSurface] = createSignal<HTMLDivElement | null>(null)

  createEffect(
    () => ({ element: surface(), anchor: props.anchor() }),
    ({ element, anchor }) => {
      if (!element || !anchor) return undefined
      const place = () => {
        const anchorRect = anchor.getBoundingClientRect()
        const rect = element.getBoundingClientRect()
        const next = clampFixedMenuPosition({
          preferredLeft: anchorRect.left,
          width: rect.width,
          height: rect.height,
          flip: { anchorTop: anchorRect.top, anchorBottom: anchorRect.bottom, gap: ANCHOR_GAP },
        })
        element.style.left = `${next.left}px`
        element.style.top = `${next.top}px`
        element.style.visibility = 'visible'
      }
      place()
      const schedule = () => requestAnimationFrame(place)
      const observer = new ResizeObserver(schedule)
      observer.observe(element)
      observer.observe(anchor)
      window.addEventListener('resize', schedule)
      window.addEventListener('scroll', schedule, true)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
      }
    },
  )

  createEffect(
    () => surface(),
    (element) => {
      if (!element) return undefined
      return registerFloatingDismissLayer({
        zIndex: FLOATING_Z_PLAYBACK_MENU,
        isInside: (event) =>
          floatingPointerInsideSurface(event, element, [props.anchor()], undefined, undefined),
        dismiss: () => props.onDone(),
      })
    },
  )

  return (
    <Portal mount={document.body}>
      <div
        ref={setSurface}
        data-no-window-drag
        class='fixed'
        style={{
          left: '0px',
          top: '0px',
          visibility: 'hidden',
          'z-index': FLOATING_Z_PLAYBACK_MENU,
        }}
      >
        <TodoCalendar
          value={props.value}
          now={props.now}
          onChange={props.onChange}
          onDone={props.onDone}
        />
      </div>
    </Portal>
  )
}
