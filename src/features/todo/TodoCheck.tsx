import Check from 'lucide-solid/icons/check'
import { Show } from 'solid-js'
import { cn } from '@/lib/ui/cn'

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
