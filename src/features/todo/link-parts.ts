export type LinkPart = { text: string; href?: string }

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"»]+$/

/** Splits text into plain parts and web links. */
export function linkParts(text: string): LinkPart[] {
  const parts: LinkPart[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    const url = match[0].replace(TRAILING_PUNCTUATION, '')
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: url, href: /^www\./i.test(url) ? `https://${url}` : url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
