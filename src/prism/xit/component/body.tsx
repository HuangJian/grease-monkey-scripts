import { useMemo } from 'preact/hooks'
import type { SourceComponentProps, SourceEditor } from '../../types'
import { useHeaderState, type HeaderStateStore } from '../../header-state'
import { parseQuery, filterItems } from '../query'
import { parseXitText } from '../parser'
import { getDueDateStatus } from '../render/due-date'
import { XitList } from '../render/list'
import type { XitData, XitLine, XitItem } from '../types'
import type { XitHeaderState } from './header'

const COMPLETED_STATUSES = new Set(['checked', 'obsolete'])

export function computePinnedLines(displayLines: XitLine[], now: Date = new Date()): XitLine[] {
  const pinned: XitLine[] = []
  const overdueItems = displayLines.filter(
    (l): l is XitItem =>
      l.type === 'item' &&
      !COMPLETED_STATUSES.has(l.status) &&
      getDueDateStatus(l.dueDate ?? '', now) === 'overdue',
  )
  const todayItems = displayLines.filter(
    (l): l is XitItem => l.type === 'item' && getDueDateStatus(l.dueDate ?? '', now) === 'today',
  )
  if (overdueItems.length > 0) {
    overdueItems.sort((a, b) => b.priority - a.priority)
    pinned.push(...overdueItems)
  }
  if (todayItems.length > 0) {
    todayItems.sort((a, b) => b.priority - a.priority)
    pinned.push(...todayItems)
  }
  return pinned
}

export function XitBody({
  data,
  root,
  runtime,
  headerStore,
  createEditor,
  showEditorDialog,
}: SourceComponentProps<XitData> & {
  headerStore: HeaderStateStore<XitHeaderState>
  createEditor?: (targetLine: number | null) => SourceEditor
}) {
  const hs = useHeaderState(headerStore)
  const lines = useMemo(() => parseXitText(data?.text ?? ''), [data?.text])
  const query = hs.query
  const queryError = hs.queryError
  const now = new Date(runtime.now())

  const isFiltering = query !== ''
  let displayLines: XitLine[] = []
  let pinnedLines: XitLine[] = []

  if (isFiltering) {
    const result = parseQuery(query)
    if (result.ok) {
      displayLines = filterItems(lines, result.ast, now)
      const enrichedLines: XitLine[] = []
      let lastHeading: XitLine | null = null
      lines.forEach((line) => {
        if (line.type === 'heading') {
          lastHeading = line
        } else if (displayLines.includes(line)) {
          if (lastHeading && !enrichedLines.includes(lastHeading)) {
            enrichedLines.push(lastHeading)
          }
          enrichedLines.push(line)
          lastHeading = null
        }
      })
      displayLines = enrichedLines
      pinnedLines = computePinnedLines(displayLines, now)
    } else {
      displayLines = lines.filter((l) => l.type !== 'blank')
    }
  } else {
    displayLines = lines
  }

  function openEditor(lineIndex?: number) {
    if (root instanceof ShadowRoot && runtime && createEditor && showEditorDialog) {
      showEditorDialog(
        root,
        <a href="https://xit.jotaen.net/" target="_blank" rel="noopener">
          [x]it! 语法规范
        </a>,
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = createEditor(lineIndex ?? null)
          return editor(dialogBody, {
            runtime,
            onRevert: () => {},
            close: dialogClose,
          })
        },
      )
    }
  }

  return (
    <div class="gm-sp-xit">
      {queryError && <div class="gm-sp-xit-query-error-box gm-sp-error-box">{queryError}</div>}
      <div class="gm-sp-xit-list">
        {displayLines.length === 0 ? (
          <div class="gm-sp-xit-empty">无符合条件的条目</div>
        ) : (
          <>
            {pinnedLines.length > 0 && (
              <div class="gm-sp-xit-pinned">
                <ListContent lines={pinnedLines} now={now} openEditor={openEditor} />
              </div>
            )}
            <ListContent lines={displayLines} now={now} openEditor={openEditor} />
          </>
        )}
      </div>
    </div>
  )
}

function ListContent({
  lines,
  now,
  openEditor,
}: {
  lines: XitLine[]
  now: Date
  openEditor?: (lineIndex?: number) => void
}) {
  function handleDblClick(e: MouseEvent) {
    const item = (e.target as HTMLElement).closest('.gm-sp-xit-item') as HTMLElement | null
    if (item) {
      const idx = Number(item.dataset['lineIndex'])
      if (!Number.isNaN(idx)) openEditor?.(idx)
    }
  }

  return (
    <div class="gm-sp-xit-list" onDblClick={handleDblClick}>
      <XitList lines={lines} now={now} />
    </div>
  )
}
