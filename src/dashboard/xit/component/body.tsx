import type { SourceComponentProps } from '../../types'
import { showEditorDialog } from '../../shell/editor'
import { createXitEditor, setPendingLineIndex } from '../editor'
import { parseQuery, filterItems } from '../query'
import { getDueDateStatus } from '../render/due-date'
import { linesToHtml } from '../render/list-render'
import type { XitData, XitLine, XitItem } from '../types'
import type { XitHeaderState } from './header'

export function XitBody({
  data: _data,
  root,
  runtime,
  headerState,
}: SourceComponentProps<XitData> & { headerState: XitHeaderState }) {
  const hs = headerState
  const lines = hs.lines
  const query = hs.query
  const queryError = hs.queryError

  const isFiltering = query !== ''
  let displayLines: XitLine[] = []

  if (isFiltering) {
    const result = parseQuery(query)
    if (result.ok) {
      displayLines = filterItems(lines, result.ast)
      const enrichedLines: XitLine[] = []
      let lastHeading: XitLine | null = null
      for (const line of lines) {
        if (line.type === 'heading') {
          lastHeading = line
        } else if (displayLines.includes(line)) {
          if (lastHeading && !enrichedLines.includes(lastHeading)) {
            enrichedLines.push(lastHeading)
          }
          enrichedLines.push(line)
          lastHeading = null
        }
      }
      displayLines = enrichedLines

      const todayItems = displayLines.filter(
        (l): l is XitItem => l.type === 'item' && getDueDateStatus(l.dueDate ?? '') === 'today',
      )
      if (todayItems.length > 0) {
        todayItems.sort((a, b) => b.priority - a.priority)
        displayLines = [...todayItems, ...displayLines]
      }
    } else {
      displayLines = lines.filter((l) => l.type !== 'blank')
    }
  } else {
    displayLines = lines
  }

  function openEditor(lineIndex?: number) {
    if (root && runtime) {
      setPendingLineIndex(lineIndex ?? null)
      showEditorDialog(
        document,
        root,
        <a href="https://xit.jotaen.net/" target="_blank" rel="noopener">
          [x]it! 语法规范
        </a>,
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = createXitEditor()
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
          <ListContent lines={displayLines} openEditor={openEditor} />
        )}
      </div>
    </div>
  )
}

function ListContent({
  lines,
  openEditor,
}: {
  lines: XitLine[]
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
    <div
      class="gm-sp-xit-list"
      onDblClick={handleDblClick}
      dangerouslySetInnerHTML={{ __html: linesToHtml(lines) }}
    />
  )
}
