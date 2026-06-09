export type XitItemStatus = 'open' | 'checked' | 'ongoing' | 'obsolete' | 'in-question'

export type XitTag = {
  name: string
  value?: string
}

export type XitItem = {
  type: 'item'
  status: XitItemStatus
  priority: number // Number of exclamation marks
  priorityText: string // The full priority match, e.g. "!!!", "..!"
  description: string // Main content, including multiline continuation text
  rawLines: string[] // Original raw lines for rendering/reconstruction
  lineIndex: number // Starting line index in the original text (0-indexed)
  dueDate: string | null // Due date string, e.g., "2026-06-09"
  tags: XitTag[] // Array of parsed tags
}

export type XitHeading = {
  type: 'heading'
  text: string
  lineIndex: number
}

export type XitBlank = {
  type: 'blank'
  lineIndex: number
}

export type XitComment = {
  type: 'comment'
  text: string
  lineIndex: number
}

export type XitLine = XitItem | XitHeading | XitBlank | XitComment

export type XitData = {
  text: string
}
