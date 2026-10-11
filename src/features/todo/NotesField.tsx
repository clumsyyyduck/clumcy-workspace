import { For, Show, createMemo, createSignal } from 'solid-js'
import { cn } from '@/lib/ui/cn'
import { WrappingTextInput } from './WrappingTextInput'
import { linkParts } from './link-parts'

type Props = {
  value: string
  label: string
  placeholder?: string
  class?: string
  readonly?: boolean
  onInput: (value: string) => void
}

/** Multiline notes that show clickable links until the text is edited. */
export function NotesField(props: Props) {
  const [editing, setEditing] = createSignal(false)
  const parts = createMemo(() => linkParts(props.value))
  const hasLinks = createMemo(() => parts().some((part) => part.href))

  return (
    <Show
      when={hasLinks() && !editing()}
      fallback={
        <WrappingTextInput
          multiline
          autofocus={editing()}
          label={props.label}
          placeholder={props.placeholder}
          class={props.class}
          value={props.value}
          readonly={props.readonly}
          onInput={props.onInput}
          onBlur={() => setEditing(false)}
        />
      }
    >
      <div
        role='textbox'
        aria-multiline='true'
        aria-label={props.label}
        tabindex={0}
        class={cn('cursor-text whitespace-pre-wrap wrap-break-word', props.class)}
        onClick={() => {
          if (!props.readonly) setEditing(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !props.readonly && event.target === event.currentTarget) {
            event.preventDefault()
            setEditing(true)
          }
        }}
      >
        <For each={parts()}>
          {(part) => (
            <Show when={part.href} fallback={part.text}>
              <a
                href={part.href}
                target='_blank'
                rel='noopener noreferrer'
                title={`Open ${part.href}`}
                class='text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'
                onClick={(event) => event.stopPropagation()}
              >
                {part.text}
              </a>
            </Show>
          )}
        </For>
      </div>
    </Show>
  )
}
