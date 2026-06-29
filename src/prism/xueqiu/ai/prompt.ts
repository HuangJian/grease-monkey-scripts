import { DEFAULT_AI_SYSTEM_PROMPT, type XueqiuNewsItem } from '../types'

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildSystemPrompt(override?: string): string {
  return override?.trim() || DEFAULT_AI_SYSTEM_PROMPT
}

export function buildUserPrompt(items: XueqiuNewsItem[]): string {
  const compact = items.map((item, idx) => ({
    i: idx,
    x: stripHtml(item.text),
  }))
  return `以下是按时间倒序排列的新闻列表（共 ${items.length} 条）。输入中的 "i" 是序号，请在输出的 "items" 中引用这些序号：
${JSON.stringify(compact)}`
}
