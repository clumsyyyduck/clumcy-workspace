import { describe, expect, test } from 'bun:test'
import { linkParts } from '../../src/features/todo/link-parts'

describe('linkParts', () => {
  test('keeps plain text as one part', () => {
    expect(linkParts('just notes')).toEqual([{ text: 'just notes' }])
  })

  test('splits out http and www links without trailing punctuation', () => {
    expect(linkParts('See https://example.com/a?b=1, or (www.ski.ru).')).toEqual([
      { text: 'See ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: ', or (' },
      { text: 'www.ski.ru', href: 'https://www.ski.ru' },
      { text: ').' },
    ])
  })

  test('handles links on separate lines', () => {
    expect(linkParts('a\nhttp://x.io\nb').map((part) => part.href ?? null)).toEqual([
      null,
      'http://x.io',
      null,
    ])
  })
})
