import { useQuery, useQueryClient } from '@tanstack/solid-query'
import AlertCircle from 'lucide-solid/icons/alert-circle'
import BellRing from 'lucide-solid/icons/bell-ring'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import Plus from 'lucide-solid/icons/plus'
import X from 'lucide-solid/icons/x'
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  onSettled,
  reconcile,
  snapshot,
} from 'solid-js'
import type { JSX } from '@solidjs/web'
import { api, isApiError, post } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'
import { closeViewer } from '@/lib/browser/url-state-actions'
import { isPathEditable } from '@/lib/files/path-utils'
import { cn } from '@/lib/ui/cn'
import {
  enqueueTextDocumentSave,
  createTextDocumentTarget,
} from '@/features/viewer/text-document-target'
import {
  mergeTodoDocuments,
  newTodoId,
  parseTodoDocument,
  reminderActive,
  serializeTodoDocument,
  todoListName,
  type TodoDocument,
  type TodoTask,
} from './todo-model'
import { TodoTaskRow } from './TodoTaskRow'

type TextDocumentRemote = { content: string; version: string }

export type TodoListPaneProps = {
  viewingPath: string
  editableFolders: string[]
  embedded?: boolean
  showClose?: boolean
  onClose?: () => void
}

const SAVE_DELAY_MS = 400
const CLOCK_TICK_MS = 30_000

function fetchTextDocument(path: string) {
  return api<TextDocumentRemote>(`/api/files/text?path=${encodeURIComponent(path)}`)
}

function plainDocument(document: TodoDocument): TodoDocument {
  return JSON.parse(JSON.stringify(snapshot(document))) as TodoDocument
}

export function TodoListPane(props: TodoListPaneProps): JSX.Element {
  const queryClient = useQueryClient()
  const queryKey = createMemo(() => queryKeys.textContent(props.viewingPath))

  const textQuery = useQuery(() => ({
    queryKey: queryKey(),
    queryFn: () => fetchTextDocument(props.viewingPath),
  }))

  const editable = createMemo(() => isPathEditable(props.viewingPath, props.editableFolders))
  const listName = createMemo(() => todoListName(props.viewingPath))

  const [document, setDocument] = createStore<TodoDocument>({ version: 1, tasks: [] })
  const [hydrated, setHydrated] = createSignal(false)
  const [parseError, setParseError] = createSignal<string | null>(null)
  const [saveError, setSaveError] = createSignal<string | null>(null)
  const [newTitle, setNewTitle] = createSignal('')
  const [expandedId, setExpandedId] = createSignal<string | null>(null)
  const [showCompleted, setShowCompleted] = createSignal(false)
  const [now, setNow] = createSignal(Date.now())

  let base: TodoDocument | null = null
  let baseVersion = ''
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saving = false
  let saveAgain = false

  const hasLocalChanges = () =>
    base !== null && serializeTodoDocument(plainDocument(document)) !== serializeTodoDocument(base)

  createEffect(
    () => textQuery.data,
    (remote) => {
      if (!remote) return
      if (hydrated() && (saving || saveTimer !== null || hasLocalChanges())) return
      try {
        const parsed = parseTodoDocument(remote.content)
        base = parsed
        baseVersion = remote.version
        setDocument(reconcile(parsed, 'id'))
        setParseError(null)
        setHydrated(true)
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Invalid todo list')
      }
    },
  )

  onSettled(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (!saving && saveTimer === null) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnIfDirty)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('beforeunload', warnIfDirty)
      if (saveTimer !== null) {
        clearTimeout(saveTimer)
        saveTimer = null
        void flush()
      }
    }
  })

  async function writeOnce(path: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const local = plainDocument(document)
      const content = serializeTodoDocument(local)
      if (base && content === serializeTodoDocument(base)) return
      try {
        const result = await post<{ version: string }>('/api/files/edit', {
          path,
          content,
          expectedHash: baseVersion,
        })
        base = local
        baseVersion = result.version
        queryClient.setQueryData(queryKeys.textContent(path), { content, version: result.version })
        return
      } catch (error) {
        if (!isApiError(error) || error.status !== 409) throw error
        const remote = await fetchTextDocument(path)
        const remoteDocument = parseTodoDocument(remote.content)
        const merged = mergeTodoDocuments(base ?? remoteDocument, local, remoteDocument)
        base = remoteDocument
        baseVersion = remote.version
        setDocument(reconcile(merged, 'id'))
      }
    }
    throw new Error('The list keeps changing elsewhere. Try again.')
  }

  async function flush() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (saving) {
      saveAgain = true
      return
    }
    saving = true
    const path = props.viewingPath
    try {
      await enqueueTextDocumentSave(createTextDocumentTarget(path), () => writeOnce(path))
      setSaveError(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.todo() })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      saving = false
      if (saveAgain) {
        saveAgain = false
        void flush()
      }
    }
  }

  function scheduleSave() {
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void flush()
    }, SAVE_DELAY_MS)
  }

  function update(mutate: (draft: TodoDocument) => void) {
    if (!editable() || !hydrated()) return
    setDocument((draft) => {
      mutate(draft)
    })
    scheduleSave()
  }

  function updateTask(id: string, mutate: (task: TodoTask) => void) {
    update((draft) => {
      const task = draft.tasks.find((candidate) => candidate.id === id)
      if (task) mutate(task)
    })
  }

  function deleteTask(id: string) {
    update((draft) => {
      draft.tasks = draft.tasks.filter((task) => task.id !== id)
    })
    if (expandedId() === id) setExpandedId(null)
  }

  function addTask() {
    const title = newTitle().trim()
    if (!title) return
    update((draft) => {
      draft.tasks.push({
        id: newTodoId(),
        title,
        done: false,
        createdAt: new Date().toISOString(),
      })
    })
    setNewTitle('')
  }

  async function handleClose() {
    if (saveTimer !== null || saving) await flush()
    if (props.onClose) props.onClose()
    else closeViewer()
  }

  const openTasks = createMemo(() => document.tasks.filter((task) => !task.done))
  const completedTasks = createMemo(() => document.tasks.filter((task) => task.done))
  const remindingCount = createMemo(
    () => document.tasks.filter((task) => reminderActive(task, now())).length,
  )

  const row = (task: TodoTask) => (
    <TodoTaskRow
      task={task}
      now={now()}
      editable={editable()}
      expanded={expandedId() === task.id}
      onToggleExpanded={() => setExpandedId((current) => (current === task.id ? null : task.id))}
      onChange={(mutate) => updateTask(task.id, mutate)}
      onDelete={() => deleteTask(task.id)}
    />
  )

  return (
    <div
      role={props.embedded ? undefined : 'dialog'}
      aria-modal={props.embedded ? undefined : 'true'}
      aria-labelledby='todo-list-title'
      data-testid='todo-list'
      class={cn(
        'flex min-h-0 flex-col bg-background text-foreground',
        props.embedded ? 'h-full' : 'fixed inset-0 z-50',
      )}
    >
      <Show when={!props.embedded && props.showClose !== false}>
        <div class='flex shrink-0 justify-end px-4 pt-4'>
          <button
            type='button'
            title='Close'
            aria-label='Close'
            class='inline-flex size-8 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            onClick={() => void handleClose()}
          >
            <X class='size-4' stroke-width={2} aria-hidden='true' />
          </button>
        </div>
      </Show>

      <div class='min-h-0 flex-1 overflow-y-auto'>
        <div class='mx-auto w-full max-w-2xl px-5 pt-8 pb-16 sm:px-8'>
          <header class='mb-6 flex items-end justify-between gap-4 px-3'>
            <div class='min-w-0'>
              <h1
                id='todo-list-title'
                class='text-[28px] leading-tight font-semibold tracking-tight wrap-break-word'
              >
                {listName()}
              </h1>
              <p class='mt-1 text-sm text-muted-foreground'>
                <Show when={hydrated()} fallback='Loading…'>
                  <Show when={openTasks().length > 0} fallback='All done'>
                    {openTasks().length} {openTasks().length === 1 ? 'task' : 'tasks'}
                  </Show>
                  <Show when={completedTasks().length > 0}>
                    {' · '}
                    {completedTasks().length} completed
                  </Show>
                </Show>
              </p>
            </div>
            <Show when={remindingCount() > 0}>
              <span class='inline-flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500/12 px-2.5 py-1 text-xs font-medium text-orange-600 dark:text-orange-400'>
                <BellRing class='size-3.5' stroke-width={2.25} aria-hidden='true' />
                {remindingCount()}
              </span>
            </Show>
          </header>

          <Show when={saveError()}>
            <button
              type='button'
              class='mb-4 flex w-full items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-left text-sm text-red-600 dark:text-red-400'
              onClick={() => void flush()}
            >
              <AlertCircle class='size-4 shrink-0' stroke-width={2} aria-hidden='true' />
              <span class='min-w-0 flex-1 truncate'>{saveError()}</span>
              <span class='shrink-0 font-medium'>Retry</span>
            </button>
          </Show>

          <Show when={textQuery.isError}>
            <p class='px-3 text-sm text-red-500'>Failed to load the list.</p>
          </Show>

          <Show when={parseError()}>
            <div class='rounded-xl bg-muted/50 px-4 py-3 text-sm'>
              <p class='font-medium'>This file isn’t a valid todo list.</p>
              <p class='mt-1 text-muted-foreground'>{parseError()}</p>
            </div>
          </Show>

          <Show when={hydrated() && !parseError()}>
            <Show when={editable()}>
              <form
                class='mb-3 flex h-11 items-center gap-3 rounded-xl bg-muted/50 px-3 transition-colors focus-within:bg-muted/70'
                onSubmit={(event) => {
                  event.preventDefault()
                  addTask()
                }}
              >
                <Plus class='size-5 text-muted-foreground' stroke-width={2} aria-hidden='true' />
                <input
                  aria-label='New task'
                  placeholder='New task'
                  class='min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70'
                  value={newTitle()}
                  onInput={(event) => setNewTitle(event.currentTarget.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </form>
            </Show>

            <div class='space-y-0.5'>
              <For each={openTasks()}>{(task) => row(task)}</For>
            </div>

            <Show when={openTasks().length === 0 && completedTasks().length === 0}>
              <p class='px-3 py-10 text-center text-sm text-muted-foreground'>No tasks yet.</p>
            </Show>

            <Show when={completedTasks().length > 0}>
              <div class='mt-6'>
                <button
                  type='button'
                  aria-expanded={showCompleted() ? 'true' : 'false'}
                  class='inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
                  onClick={() => setShowCompleted((value) => !value)}
                >
                  <ChevronRight
                    class={cn(
                      'size-4 transition-transform duration-200',
                      showCompleted() && 'rotate-90',
                    )}
                    stroke-width={2}
                    aria-hidden='true'
                  />
                  Completed
                  <span class='text-muted-foreground/70'>{completedTasks().length}</span>
                </button>
                <Show when={showCompleted()}>
                  <div class='mt-1 space-y-0.5'>
                    <For each={completedTasks()}>{(task) => row(task)}</For>
                  </div>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}
