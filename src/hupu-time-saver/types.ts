export type HupuApp = {
  start(): void
  tagAuthor(id: string, commentNumber: number | string, tag: string, delta: number): void
  setTag(id: string, tag: string, score: number, commentNumber: number | string): void
  unsetTag(id: string, tag: string): void
  getTags(puid: string): Record<string, { url: string; score: number }> | undefined
  getScore(puid: string): number
  getAuthorTagMap(): Record<string, Record<string, { url: string; score: number }>>
  applyHighlights(): void
  processElement(root: Node): void
}
