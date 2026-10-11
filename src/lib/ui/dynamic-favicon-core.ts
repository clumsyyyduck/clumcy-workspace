export { getAvailableIconSvg as getLucideIconSvg } from './available-icon-svgs'

export const DEFAULT_FAVICON_DATA_URL =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2'><path d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/></svg>"

export async function generateFaviconFromSvg(
  svgString: string,
  color: string = '#ffffff',
): Promise<string> {
  const canvas = document.createElement('canvas')
  const size = 32
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (!ctx) return ''

  const img = new Image()
  const coloredSvg = svgString
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/fill="currentColor"/g, `fill="${color}"`)

  const svgBlob = new Blob([coloredSvg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  return new Promise<string>((resolve) => {
    img.onload = () => {
      ctx.clearRect(0, 0, size, size)
      const padding = 4
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve('')
    }
    img.src = url
  })
}

let faviconBaseHref: string | null = null
let faviconBadge = false
let faviconRenderGeneration = 0

function applyFaviconLink(href: string) {
  const existingLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement
  if (existingLink) {
    existingLink.href = href
  } else {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/png'
    link.href = href
    document.head.appendChild(link)
  }
}

function drawFaviconBadge(baseHref: string): Promise<string> {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve('')
  const drawDot = () => {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(25, 7, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#ff9f0a'
    ctx.beginPath()
    ctx.arc(25, 7, 6, 0, Math.PI * 2)
    ctx.fill()
    return canvas.toDataURL('image/png')
  }
  return new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size)
      resolve(drawDot())
    }
    img.onerror = () => resolve(drawDot())
    img.src = baseHref
  })
}

function renderFavicon() {
  const generation = ++faviconRenderGeneration
  const baseHref = faviconBaseHref ?? DEFAULT_FAVICON_DATA_URL
  if (!faviconBadge) {
    applyFaviconLink(baseHref)
    return
  }
  void drawFaviconBadge(baseHref).then((badged) => {
    if (generation === faviconRenderGeneration) applyFaviconLink(badged || baseHref)
  })
}

export function setFaviconHref(href: string) {
  faviconBaseHref = href
  renderFavicon()
}

/** Overlays a small dot on the current tab icon, e.g. for a due reminder. */
export function setFaviconBadge(visible: boolean) {
  if (faviconBadge === visible) return
  faviconBadge = visible
  if (faviconBaseHref === null) {
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
    faviconBaseHref = link?.href || DEFAULT_FAVICON_DATA_URL
  }
  renderFavicon()
}

/** The tab icon without any badge overlay. */
export function getFaviconBaseHref(): string | null {
  if (faviconBaseHref !== null) return faviconBaseHref
  const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
  return link?.href || null
}

export type DynamicFaviconNavState = {
  dir: string | null
  viewing: string | null
  playing: string | null
}
