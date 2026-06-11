export type TagPanelCallbacks = {
  onTagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void
  onSetTag: (id: string, tag: string, score: number, commentNumber: number | string) => void
  onUnsetTag: (id: string, tag: string) => void
}

export type QuickButtonConfig = {
  tag: string
  display: string
}

export type QuickLabels = {
  shame: QuickButtonConfig
  thank: QuickButtonConfig
}
