import type { XitLine, XitItem, XitItemStatus } from './types'

const STATUS_MAP: Record<string, XitItemStatus> = {
  ' ': 'open',
  'x': 'checked',
  '@': 'ongoing',
  '~': 'obsolete',
  '?': 'in-question',
}

/**
 * Parses a block of xit text into an array of XitLines.
 */
export function parseXitText(text: string): XitLine[] {
  const lines = text.split(/\r?\n/)
  const result: XitLine[] = []
  let currentItem: XitItem | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Check for continuation line (starts with exactly 4 spaces)
    if (/^ {4}/.test(line) && currentItem) {
      const continuationText = line.slice(4)
      currentItem.rawLines.push(line)
      currentItem.description += '\n' + continuationText
      continue
    }

    // Since it's not a continuation line, any active item parsing ends here.
    if (currentItem) {
      finalizeItem(currentItem)
      currentItem = null
    }

    // Check for a new task item
    const checkboxMatch = /^\[([ x@~?])\](?: (.*)|$)/.exec(line)
    if (checkboxMatch) {
      const statusChar = checkboxMatch[1]!
      const status = STATUS_MAP[statusChar] || 'open'
      const rest = checkboxMatch[2] ?? ''

      // Parse priority
      const priorityMatch = /^(\.+!+|!+\.+|!+)(?: (.*)|$)/.exec(rest)
      let priorityText = ''
      let priority = 0
      let description = rest

      if (priorityMatch) {
        priorityText = priorityMatch[1]!
        priority = (priorityText.match(/!/g) || []).length
        description = priorityMatch[2] ?? ''
      }

      currentItem = {
        type: 'item',
        status,
        priority,
        priorityText,
        description,
        rawLines: [line],
        lineIndex: i,
        dueDate: null,
        tags: [],
      }
      result.push(currentItem)
      continue
    }

    // Check for heading (ends with colon, doesn't start with space, not empty)
    if (line.trim().endsWith(':') && !line.startsWith(' ') && line.trim() !== ':') {
      result.push({
        type: 'heading',
        text: line.trim().slice(0, -1).trim(),
        lineIndex: i,
      })
      continue
    }

    // Check for blank line
    if (line.trim() === '') {
      result.push({
        type: 'blank',
        lineIndex: i,
      })
      continue
    }

    // Default to comment/plain text
    result.push({
      type: 'comment',
      text: line,
      lineIndex: i,
    })
  }

  // Finalize the last item if it exists
  if (currentItem) {
    finalizeItem(currentItem)
  }

  return result
}

/**
 * Post-processes an item description to parse tags and due dates.
 */
function finalizeItem(item: XitItem): void {
  // Parse due date: -> YYYY-MM-DD, -> YYYY-MM, -> YYYY-Qx, -> YYYY-Wx, -> YYYY
  const dueDateRegex = /(?:^|\s)->\s*(\d{4}(?:-\d{2}-\d{2}|-\d{2}|-Q[1-4]|-W\d{1,2})?)\b/
  const dateMatch = dueDateRegex.exec(item.description)
  if (dateMatch) {
    item.dueDate = dateMatch[1]!
  }

  // Parse tags: #name or #name=value or #name="value"
  const tagRegex = /(?:^|\s)#([\w\d\u4e00-\u9fa5_-]+)(?:=([^\s#]+|"[^"]*"|'[^']*'))?/g
  let tagMatch: RegExpExecArray | null
  const seenTags = new Set<string>()

  tagRegex.lastIndex = 0

  while ((tagMatch = tagRegex.exec(item.description)) !== null) {
    const name = tagMatch[1]!.toLowerCase()
    let value = tagMatch[2]
    if (value) {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
    }
    const tagKey = value ? `${name}=${value}` : name
    if (!seenTags.has(tagKey)) {
      seenTags.add(tagKey)
      item.tags.push({ name, value })
    }
  }
}

/**
 * Parses an xit due date string into a concrete Date object representing the end of that period.
 */
export function parseDueDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim()

  // YYYY-MM-DD
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (ymd) {
    return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
  }

  // YYYY-MM
  const ym = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (ym) {
    return new Date(Number(ym[1]), Number(ym[2]), 0)
  }

  // YYYY-Qx
  const yq = /^(\d{4})-Q([1-4])$/.exec(trimmed)
  if (yq) {
    const year = Number(yq[1])
    const quarter = Number(yq[2])
    return new Date(year, quarter * 3, 0)
  }

  // YYYY-Wx (week)
  const yw = /^(\d{4})-W(\d{1,2})$/.exec(trimmed)
  if (yw) {
    const year = Number(yw[1])
    const week = Number(yw[2])
    const d = new Date(year, 0, 1)
    const dayOffset = (8 - d.getDay()) % 7
    const thursday = new Date(year, 0, 1 + dayOffset)
    const endOfWeek = new Date(thursday.getTime() + (week - 1) * 7 * 24 * 3600 * 1000 + 3 * 24 * 3600 * 1000)
    return endOfWeek
  }

  // YYYY
  const y = /^(\d{4})$/.exec(trimmed)
  if (y) {
    return new Date(Number(y[1]), 12, 0)
  }

  return null
}
