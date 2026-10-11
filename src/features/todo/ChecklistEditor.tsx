import Plus from 'lucide-solid/icons/plus'
import X from 'lucide-solid/icons/x'
import { For, Show, createSignal } from 'solid-js'
import { cn } from '@/lib/ui/cn'
import { TodoCheck } from './TodoCheck'
import { newTodoId, type TodoChecklistItem } from './todo-model'
import { WrappingTextInput } from './WrappingTextInput'

type ChecklistOwner = { checklist?: TodoChecklistItem[] }

type Props = {
  items: TodoChecklistItem[]
  editable: boolean
  title?: string
  onChange: (mutate: (owner: ChecklistOwner) => void) => void
}

export function ChecklistEditor(props: Props) {
  const [newItem, setNewItem] = createSignal('')

  function addItem() {
    const text = newItem().trim()
    if (!text) return
    props.onChange((owner) => {
      owner.checklist = [...(owner.checklist ?? []), { id: newTodoId(), text, done: false }]
    })
    setNewItem('')
  }

  function updateItem(id: string, mutate: (item: TodoChecklistItem) => void) {
    props.onChange((owner) => {
      const target = owner.checklist?.find((entry) => entry.id === id)
      if (target) mutate(target)
    })
  }

  return (
    <div class='space-y-1'>
      <div class='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {props.title ?? 'Checklist'}
      </div>
      <For each={props.items}>
        {(item) => (
          <div class='group/item flex items-start gap-2.5 rounded-md py-1'>
            <TodoCheck
              class='mt-0.5'
              size='sm'
              checked={item.done}
              disabled={!props.editable}
              label={item.done ? 'Mark item as not done' : 'Mark item as done'}
              onToggle={() =>
                updateItem(item.id, (target) => {
                  target.done = !target.done
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
                updateItem(item.id, (target) => {
                  target.text = text
                })
              }
            />
            <Show when={props.editable}>
              <button
                type='button'
                aria-label='Remove item'
                class='inline-flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100'
                onClick={() =>
                  props.onChange((owner) => {
                    owner.checklist = owner.checklist?.filter((entry) => entry.id !== item.id)
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
          <WrappingTextInput
            label='New checklist item'
            placeholder='Add item'
            class='min-w-0 flex-1 text-sm leading-5 placeholder:text-muted-foreground/70'
            value={newItem()}
            onInput={setNewItem}
            onEnter={addItem}
            onBlur={addItem}
          />
        </div>
      </Show>
    </div>
  )
}
