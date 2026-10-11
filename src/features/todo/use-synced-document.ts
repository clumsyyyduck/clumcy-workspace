import { useQuery, useQueryClient } from '@tanstack/solid-query'
import {
  createEffect,
  createMemo,
  createSignal,
  createStore,
  onSettled,
  reconcile,
  snapshot,
  untrack,
  type Accessor,
} from 'solid-js'
import { api, isApiError, post } from '@/lib/api/client'
import { queryKeys } from '@/lib/api/query-keys'
import {
  createTextDocumentTarget,
  enqueueTextDocumentSave,
} from '@/features/viewer/text-document-target'

type TextDocumentRemote = { content: string; version: string }

export type SyncedDocumentOptions<T extends object> = {
  path: Accessor<string>
  editable: Accessor<boolean>
  initial: T
  parse: (content: string) => T
  serialize: (document: T) => string
  /** Re-applies local edits on top of a remote version that changed underneath. */
  merge: (base: T, local: T, remote: T) => T
  /** Query keys to refresh after a successful save. */
  invalidate?: readonly (readonly unknown[])[]
}

const SAVE_DELAY_MS = 400

export function fetchTextDocument(path: string) {
  return api<TextDocumentRemote>(`/api/files/text?path=${encodeURIComponent(path)}`)
}

function plain<T extends object>(document: T): T {
  return JSON.parse(JSON.stringify(snapshot(document))) as T
}

/**
 * Keeps a JSON-backed file in a fine-grained store: edits save after a short pause,
 * remote changes are picked up while there are no local edits, and conflicting saves
 * are merged and retried.
 */
export function useSyncedDocument<T extends object>(options: SyncedDocumentOptions<T>) {
  const queryClient = useQueryClient()
  const queryKey = createMemo(() => queryKeys.textContent(options.path()))

  const textQuery = useQuery(() => ({
    queryKey: queryKey(),
    queryFn: () => fetchTextDocument(options.path()),
  }))

  const [document, setDocument] = createStore<T>(structuredClone(options.initial) as never)
  const [hydrated, setHydrated] = createSignal(false)
  const [parseError, setParseError] = createSignal<string | null>(null)
  const [saveError, setSaveError] = createSignal<string | null>(null)

  let base: T | null = null
  let baseVersion = ''
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saving = false
  let saveAgain = false

  const hasLocalChanges = () =>
    base !== null && options.serialize(plain(document)) !== options.serialize(base)

  createEffect(
    () =>
      textQuery.isPending || textQuery.isError
        ? undefined
        : { content: textQuery.data.content, version: textQuery.data.version },
    (remote) => {
      if (!remote) return
      if (untrack(() => hydrated() && (saving || saveTimer !== null || hasLocalChanges()))) return
      try {
        const parsed = options.parse(remote.content)
        base = parsed
        baseVersion = remote.version
        setDocument(reconcile(parsed, 'id'))
        setParseError(null)
        setHydrated(true)
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Invalid file')
      }
    },
  )

  onSettled(() => {
    const warnIfDirty = (event: BeforeUnloadEvent) => {
      if (!saving && saveTimer === null) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnIfDirty)
    return () => {
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
      const local = plain(document)
      const content = options.serialize(local)
      if (base && content === options.serialize(base)) return
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
        const remoteDocument = options.parse(remote.content)
        const merged = options.merge(base ?? remoteDocument, local, remoteDocument)
        base = remoteDocument
        baseVersion = remote.version
        setDocument(reconcile(merged, 'id'))
      }
    }
    throw new Error('The file keeps changing elsewhere. Try again.')
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
    const path = options.path()
    try {
      await enqueueTextDocumentSave(createTextDocumentTarget(path), () => writeOnce(path))
      setSaveError(null)
      for (const key of options.invalidate ?? [])
        void queryClient.invalidateQueries({ queryKey: key })
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

  function update(mutate: (draft: T) => void) {
    if (!options.editable() || !hydrated()) return
    setDocument((draft) => {
      mutate(draft as T)
    })
    scheduleSave()
  }

  return {
    document,
    hydrated,
    parseError,
    saveError,
    loadFailed: () => textQuery.isError,
    pending: () => saving || saveTimer !== null,
    update,
    flush,
  }
}
