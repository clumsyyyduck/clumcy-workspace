import AlertCircle from 'lucide-solid/icons/alert-circle'
import ChevronLeft from 'lucide-solid/icons/chevron-left'
import Plus from 'lucide-solid/icons/plus'
import X from 'lucide-solid/icons/x'
import { For, Show, createMemo, createSignal } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { ChecklistEditor } from '@/features/todo/ChecklistEditor'
import { NotesField } from '@/features/todo/NotesField'
import { WrappingTextInput } from '@/features/todo/WrappingTextInput'
import { useSyncedDocument } from '@/features/todo/use-synced-document'
import { isApiError, post } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'
import { closeViewer } from '@/lib/browser/url-state-actions'
import { isPathEditable } from '@/lib/files/path-utils'
import { cn } from '@/lib/ui/cn'
import { useQueryClient } from '@tanstack/solid-query'
import { ProgressRing } from './ProgressRing'
import { SubgoalCard } from './SubgoalCard'
import {
  goalFileName,
  goalProgress,
  goalTitleFromPath,
  goalsBoardPath,
  mergeGoalDocuments,
  newSubgoal,
  parseGoalDocument,
  serializeGoalDocument,
  type GoalDocument,
  type Subgoal,
} from './goal-model'
import { useToday } from './use-today'

export type GoalPaneProps = {
  viewingPath: string
  editableFolders: string[]
  embedded?: boolean
  showClose?: boolean
  onClose?: () => void
  onNavigate?: (path: string) => void
}

export function PlannerChrome(props: {
  testId: string
  labelledBy: string
  embedded?: boolean
  showClose?: boolean
  onClose: () => void
  children: JSX.Element
}) {
  return (
    <div
      role={props.embedded ? undefined : 'dialog'}
      aria-modal={props.embedded ? undefined : 'true'}
      aria-labelledby={props.labelledBy}
      data-testid={props.testId}
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
            onClick={() => props.onClose()}
          >
            <X class='size-4' stroke-width={2} aria-hidden='true' />
          </button>
        </div>
      </Show>
      <div class='min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]'>
        <div class='mx-auto w-full max-w-2xl px-5 pt-6 pb-16 sm:px-8'>{props.children}</div>
      </div>
    </div>
  )
}

export function GoalPane(props: GoalPaneProps): JSX.Element {
  const editable = createMemo(() => isPathEditable(props.viewingPath, props.editableFolders))
  const today = useToday()
  const queryClient = useQueryClient()

  const synced = useSyncedDocument<GoalDocument>({
    path: () => props.viewingPath,
    editable,
    initial: { version: 1, title: '', subgoals: [] },
    parse: (content) => parseGoalDocument(content, goalTitleFromPath(props.viewingPath)),
    serialize: serializeGoalDocument,
    merge: mergeGoalDocuments,
    invalidate: [queryKeys.goals()],
  })
  const { document, hydrated, parseError, saveError, update, flush } = synced

  const [newTitle, setNewTitle] = createSignal('')
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const progress = createMemo(() => goalProgress(document, today()))

  function updateSubgoal(id: string, mutate: (subgoal: Subgoal) => void) {
    update((draft) => {
      const subgoal = draft.subgoals.find((candidate) => candidate.id === id)
      if (subgoal) mutate(subgoal)
    })
  }

  function addSubgoal() {
    const title = newTitle().trim()
    if (!title) return
    update((draft) => {
      draft.subgoals.push(newSubgoal(title, 'planned', today()))
    })
    setNewTitle('')
  }

  async function handleClose() {
    if (synced.pending()) await flush()
    if (props.onClose) props.onClose()
    else closeViewer()
  }

  async function renameFileToTitle() {
    if (!editable() || !props.onNavigate) return
    const fileName = goalFileName(document.title)
    const oldPath = props.viewingPath
    const slash = oldPath.lastIndexOf('/')
    const folder = oldPath.slice(0, slash)
    if (oldPath.slice(slash + 1).toLowerCase() === fileName.toLowerCase()) return
    if (synced.pending()) await flush()
    const base = fileName.slice(0, -'.goal.json'.length)
    for (let index = 1; index < 50; index++) {
      const newPath = `${folder}/${index === 1 ? fileName : `${base} ${index}.goal.json`}`
      if (newPath.toLowerCase() === oldPath.toLowerCase()) return
      try {
        await post('/api/files/rename', { oldPath, newPath })
        await queryClient.invalidateQueries({ queryKey: queryKeys.goals() })
        props.onNavigate(newPath)
        return
      } catch (cause) {
        if (isApiError(cause) && cause.status === 409) continue
        return
      }
    }
  }

  async function openBoard() {
    if (synced.pending()) await flush()
    props.onNavigate?.(goalsBoardPath(props.viewingPath))
  }

  const backButton = () => (
    <Show when={props.onNavigate}>
      <button
        type='button'
        title='Back to Goals'
        aria-label='Goals'
        class='-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted/60'
        onClick={() => void openBoard()}
      >
        <ChevronLeft class='size-5' stroke-width={2.25} aria-hidden='true' />
      </button>
    </Show>
  )

  return (
    <PlannerChrome
      testId='goal'
      labelledBy='goal-title'
      embedded={props.embedded}
      showClose={props.showClose}
      onClose={() => void handleClose()}
    >
      <Show when={!hydrated() || parseError()}>
        <div class='mb-3'>{backButton()}</div>
      </Show>

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

      <Show when={synced.loadFailed()}>
        <p class='text-sm text-red-500'>Failed to load the goal.</p>
      </Show>

      <Show when={parseError()}>
        <div class='rounded-xl bg-muted/50 px-4 py-3 text-sm'>
          <p class='font-medium'>This file isn’t a valid goal.</p>
          <p class='mt-1 text-muted-foreground'>{parseError()}</p>
        </div>
      </Show>

      <Show when={hydrated() && !parseError()}>
        <header class='sticky top-0 z-10 -mx-1 mb-4 flex items-center gap-2 bg-background px-1 py-2'>
          {backButton()}
          <div class='min-w-0 flex-1'>
            <h1 id='goal-title' class='sr-only'>
              {document.title}
            </h1>
            <WrappingTextInput
              label='Goal title'
              class='text-xl leading-tight font-semibold tracking-tight'
              value={document.title}
              readonly={!editable()}
              onInput={(title) =>
                update((draft) => {
                  draft.title = title
                })
              }
              onBlur={() => void renameFileToTitle()}
            />
          </div>
          <Show when={progress() !== null}>
            <div
              class='flex shrink-0 items-center gap-1.5 text-primary'
              title={`${Math.round(progress()! * 100)}% this week`}
            >
              <ProgressRing value={progress()!} size={26} stroke={3} label='Progress this week' />
              <span class='text-xs text-muted-foreground tabular-nums'>
                {Math.round(progress()! * 100)}%
              </span>
            </div>
          </Show>
        </header>

        <div class='mb-6 space-y-4'>
          <NotesField
            label='Goal notes'
            placeholder='Why this goal matters'
            class='min-h-12 rounded-xl bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:bg-muted/70'
            value={document.description ?? ''}
            readonly={!editable()}
            onInput={(description) =>
              update((draft) => {
                draft.description = description
              })
            }
          />
          <ChecklistEditor
            items={document.checklist ?? []}
            editable={editable()}
            onChange={(mutate) => update((draft) => mutate(draft))}
          />
        </div>

        <h2 class='mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
          Subgoals · {document.subgoals.length}
        </h2>

        <Show when={editable()}>
          <form
            class='mb-3 flex h-11 items-center gap-3 rounded-xl bg-muted/50 px-3 transition-colors focus-within:bg-muted/70'
            onSubmit={(event) => {
              event.preventDefault()
              addSubgoal()
            }}
          >
            <Plus class='size-5 text-muted-foreground' stroke-width={2} aria-hidden='true' />
            <input
              aria-label='New subgoal'
              placeholder='New subgoal'
              class='min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70'
              value={newTitle()}
              onInput={(event) => setNewTitle(event.currentTarget.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </form>
        </Show>

        <div class='space-y-2'>
          <For each={document.subgoals}>
            {(subgoal) => (
              <SubgoalCard
                subgoal={subgoal}
                today={today()}
                editable={editable()}
                expanded={expandedId() === subgoal.id}
                onToggleExpanded={() =>
                  setExpandedId((current) => (current === subgoal.id ? null : subgoal.id))
                }
                onChange={(mutate) => updateSubgoal(subgoal.id, mutate)}
                onDelete={() =>
                  update((draft) => {
                    draft.subgoals = draft.subgoals.filter((entry) => entry.id !== subgoal.id)
                  })
                }
              />
            )}
          </For>
        </div>

        <Show when={document.subgoals.length === 0}>
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>
            Break the goal into subgoals: daily habits, planned sessions or one-off steps.
          </p>
        </Show>
      </Show>
    </PlannerChrome>
  )
}
