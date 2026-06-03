import type { Runtime } from '../../runtime'

export type SourceEditorContext = {
  runtime: Runtime
  onRevert: () => void
}

export type SourceEditor = (container: HTMLElement, ctx: SourceEditorContext) => void

export type Source<T> = {
  readonly id: string
  readonly title: string
  readonly ttlMs: number
  readonly placement?: 'main' | 'side'
  fetch(runtime: Runtime): Promise<T>
  render(container: HTMLElement, data: T | null): void
  customizeHeader?(titleContainer: HTMLElement, data: T | null): void
  createEditor?: () => SourceEditor
}

export function resolveTtl<T>(source: Source<T>, ttlMinutes: number): number {
  return ttlMinutes * 60_000
}
