export type RedditApp = {
  start(): void
  stop(): void
  getAuthorTagMap(): Record<string, Record<string, { url: string; score: number }>>
  tagAuthor(username: string, commentId: string, tag: string, delta: number): void
  setTag(username: string, tag: string, score: number, commentId: string): void
  unsetTag(username: string, tag: string): void
  applyHighlights(): void
  processElement(root: Node): void
}
