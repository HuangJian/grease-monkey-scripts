import type { XitLine } from './types'

export function getTagCounts(lines: XitLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  lines
    .filter((line) => line.type === 'item')
    .forEach((line) => {
      line.tags.forEach((tag) => {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
      })
    })
  return counts
}
