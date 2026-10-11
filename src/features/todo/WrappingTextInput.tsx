import { createEffect, createSignal } from 'solid-js'
import { cn } from '@/lib/ui/cn'

const supportsFieldSizing =
  typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content') === true

type Props = {
  value: string
  label: string
  class?: string
  placeholder?: string
  readonly?: boolean
  /** Allows line breaks, e.g. for notes. */
  multiline?: boolean
  /** Focuses the field with the caret at the end once it mounts. */
  autofocus?: boolean
  onInput: (value: string) => void
  onBlur?: (value: string) => void
  onEnter?: (value: string) => void
}

const NAVIGATION_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]

/** Text field that grows with its content instead of scrolling or cutting text off. */
export function WrappingTextInput(props: Props) {
  const [element, setElement] = createSignal<HTMLTextAreaElement | null>(null)

  const fit = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  createEffect(
    () => ({ textarea: element(), value: props.value }),
    ({ textarea }) => {
      if (!textarea || supportsFieldSizing) return undefined
      fit(textarea)
      let width = textarea.clientWidth
      const observer = new ResizeObserver(() => {
        if (textarea.clientWidth === width) return
        width = textarea.clientWidth
        fit(textarea)
      })
      observer.observe(textarea)
      return () => observer.disconnect()
    },
  )

  createEffect(
    () => element(),
    (textarea) => {
      if (!textarea || !props.autofocus) return
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    },
  )

  return (
    <textarea
      ref={setElement}
      rows={props.multiline ? 2 : 1}
      aria-label={props.label}
      placeholder={props.placeholder}
      spellcheck={false}
      class={cn(
        'block w-full resize-none overflow-hidden bg-transparent wrap-break-word outline-none field-sizing-content',
        props.class,
      )}
      value={props.value}
      readonly={props.readonly}
      onKeyDown={(event) => {
        if (NAVIGATION_KEYS.includes(event.key)) event.stopPropagation()
        if (event.key !== 'Enter' || props.multiline) return
        event.preventDefault()
        if (props.onEnter) props.onEnter(event.currentTarget.value)
        else event.currentTarget.blur()
      }}
      onInput={(event) => {
        const textarea = event.currentTarget
        const value = props.multiline ? textarea.value : textarea.value.replace(/\s*\r?\n\s*/g, ' ')
        if (value !== textarea.value) textarea.value = value
        props.onInput(value)
      }}
      onBlur={(event) => props.onBlur?.(event.currentTarget.value)}
    />
  )
}
