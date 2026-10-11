import { Portal, type JSX } from '@solidjs/web'
import { createEffect, createSignal, type Accessor } from 'solid-js'
import { clampFixedMenuPosition } from '@/lib/ui/clamp-fixed-menu'
import {
  floatingPointerInsideSurface,
  registerFloatingDismissLayer,
} from '@/lib/ui/floating-layer-registry'
import { FLOATING_Z_PLAYBACK_MENU } from '@/lib/ui/floating-z-index'

const ANCHOR_GAP = 6

type Props = {
  anchor: Accessor<HTMLElement | null>
  onDismiss: () => void
  children: JSX.Element
}

/**
 * Floats content over the page next to its trigger: below it when there is room on
 * screen, otherwise above, always kept clear of the viewport edges. Mounted on the
 * document body so modals and workspace windows cannot clip or cover it.
 */
export function AnchoredPopover(props: Props) {
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
        dismiss: () => props.onDismiss(),
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
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          props.onDismiss()
        }}
      >
        {props.children}
      </div>
    </Portal>
  )
}
