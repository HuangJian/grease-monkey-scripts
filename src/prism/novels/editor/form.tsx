/**
 * Novels editor form component.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { numberOrDefault } from '../../../utils'
import { validateConfig } from '../../config'
import {
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  fieldLabel,
  toFieldRule,
} from '../../editor-helpers'
import { EditorListToolbar } from '../../editor-helpers/list-toolbar'
import {
  BOOKS_PER_PAGE,
  BOOK_STATUS_LABELS,
  BOOK_STATUSES,
  filterBooks,
  renameKey,
  type BookStatus,
} from './list-toolbar'
import { pageCount, pageOf } from '../../editor-helpers/list-toolbar'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
  BadgeType,
} from '../../types'
import type { NovelBookConfig, NovelSourceOptions } from '../types'
import { ADVANCED_FIELDS } from './types'
import { hostnameFor, isUnknownHost, loadFreshOptions } from './helpers'
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon } from '../../shared/icons'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

type NovelsEditorFormProps = {
  fresh: NovelSourceOptions
  titleMap: Map<string, string>
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function NovelsEditorForm({
  fresh,
  titleMap,
  settings,
  ctx,
  handleRef,
}: NovelsEditorFormProps) {
  const [books, setBooks] = useState<NovelBookConfig[]>(() =>
    fresh.books.map((b) => ({ title: b.title, urls: [...b.urls] })),
  )
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
    ADVANCED_FIELDS.reduce(
      (out, f) => {
        const val = (fresh as Record<string, unknown>)[f.prop]
        out[f.prop] = numberOrDefault(val, 0)
        return out
      },
      {} as Record<string, number>,
    ),
  )
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  /** List controls for a fifty-book library, keyed by url like the selection. */
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<BookStatus>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmRemove, setConfirmRemove] = useState(false)
  /** Unapplied url edits, keyed by the url they would replace. */
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({})
  const baselineRef = useRef('')
  const bookTitleRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])
  const urlInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  const setBookTitle = useCallback((bookIdx: number, title: string) => {
    setBooks((prev) => prev.map((b, i) => (i === bookIdx ? { ...b, title } : b)))
  }, [])

  const removeBook = useCallback((bookIdx: number) => {
    setBooks((prev) => prev.filter((_, i) => i !== bookIdx))
  }, [])

  const removeUrl = useCallback((bookIdx: number, urlIdx: number) => {
    setBooks((prev) =>
      prev
        .map((b, i) => {
          if (i !== bookIdx) return b
          const urls = b.urls.filter((_, j) => j !== urlIdx)
          return { ...b, urls }
        })
        .filter((b) => b.urls.length > 0),
    )
  }, [])

  const moveUrl = useCallback((bookIdx: number, urlIdx: number, dir: -1 | 1) => {
    setBooks((prev) =>
      prev.map((b, i) => {
        if (i !== bookIdx) return b
        const next = [...b.urls]
        const target = urlIdx + dir
        if (target < 0 || target >= next.length) return b
        ;[next[urlIdx], next[target]] = [next[target]!, next[urlIdx]!]
        return { ...b, urls: next }
      }),
    )
  }, [])

  const commitAddUrl = useCallback(
    (bookIdx: number) => {
      const el = urlInputRefs.current[bookIdx]
      const url = (el?.value ?? '').trim()
      if (!url) {
        setError('请输入来源 URL')
        return
      }
      if (!hostnameFor(url)) {
        setError('URL 格式无效')
        return
      }
      if (books.some((b) => b.urls.includes(url))) {
        setError('该书库已在列表中')
        return
      }
      setBooks((prev) => prev.map((b, i) => (i === bookIdx ? { ...b, urls: [...b.urls, url] } : b)))
      if (el) el.value = ''
      setError('')
    },
    [books],
  )

  const handleAdd = useCallback(() => {
    setError('')
    const url = urlRef.current?.value.trim()
    const title = bookTitleRef.current?.value.trim()
    if (!url) {
      setError('请输入书库 URL')
      return
    }
    if (!hostnameFor(url)) {
      setError('URL 格式无效')
      return
    }
    const existing = books.find((b) => b.urls.includes(url))
    if (existing) {
      setError('该书库已在列表中')
      return
    }
    setBooks((prev) => {
      const match = title ? prev.find((b) => b.title === title) : undefined
      if (match) {
        return prev.map((b) => (b === match ? { ...b, urls: [...b.urls, url] } : b))
      }
      return [...prev, { title: title ?? '', urls: [url] }]
    })
    if (urlRef.current) urlRef.current.value = ''
    if (bookTitleRef.current) bookTitleRef.current.value = ''
  }, [books])

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  /** A book's identity in this editor: its first url, which is its key. */
  const keyOf = (book: NovelBookConfig): string => book.urls[0] ?? book.title
  const visible = filterBooks(books, query, status, (url) => isUnknownHost(url))
  const pages = pageCount(visible.length, BOOKS_PER_PAGE)
  const currentPage = Math.min(page, pages - 1)
  const rows = pageOf(visible, currentPage, BOOKS_PER_PAGE)
  const visibleKeys = visible.map(keyOf)
  const selectedVisible = visibleKeys.filter((key) => selected.has(key))

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  /**
   * An edited url is applied on blur / Enter: it is part of the book's key, so
   * rewriting it mid-typing would remount the row under the cursor.
   */
  function commitUrl(bookIdx: number, urlIdx: number, oldUrl: string) {
    const draft = urlDrafts[oldUrl]
    if (draft === undefined) return
    const next = draft.trim()
    setUrlDrafts((prev) => {
      const { [oldUrl]: _dropped, ...rest } = prev
      return rest
    })
    if (!next || next === oldUrl) return
    if (!hostnameFor(next)) {
      setError('URL 格式无效')
      return
    }
    if (books.some((b) => b.urls.includes(next))) {
      setError('该书库已在列表中')
      return
    }
    setError('')
    setBooks((prev) =>
      prev.map((b, i) =>
        i === bookIdx ? { ...b, urls: b.urls.map((u, j) => (j === urlIdx ? next : u)) } : b,
      ),
    )
    // The first url doubles as the row's key — keep selection and expansion.
    if (urlIdx === 0) {
      setSelected((prev) => renameKey(prev, oldUrl, next))
      setExpanded((prev) => renameKey(prev, oldUrl, next))
    }
  }

  function removeSelected() {
    const keys = new Set(selectedVisible)
    if (keys.size === 0) return
    setBooks((prev) => prev.filter((b) => !keys.has(keyOf(b))))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) next.delete(key)
      return next
    })
    setConfirmRemove(false)
  }

  /**
   * What `isDirty` compares: the rows, the visible settings, and the advanced
   * numbers as they stand in their inputs.
   */
  function snapshot(): string {
    const advancedValues = advancedRefs.current.map((input) => input?.value ?? '')
    return JSON.stringify({ books, tabTitle, priority, badgeType, advanced: advancedValues })
  }

  // Taken after mount: the advanced inputs do not exist on the first render.
  useLayoutEffect(() => {
    if (baselineRef.current === '') baselineRef.current = snapshot()
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      // A book with several sources needs the room, and dropping edits to fifty
      // of them without asking is not acceptable.
      size: 'xl',
      isDirty: () => snapshot() !== baselineRef.current,
      save() {
        setError('')
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          ADVANCED_FIELDS.map((f, i) => toFieldRule(inputList[i]!, f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const novels: NovelSourceOptions = {
          books: books.map((b) => ({ title: b.title, urls: [...b.urls] })),
          ttlMinutes: Math.round(nums[0]!),
          initialNewChapters: Math.round(nums[1]!),
          maxNewChaptersPerBook: Math.round(nums[2]!),
          maxLatestWindow: Math.round(nums[3]!),
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'novels',
          section: novels,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'novels', { tabTitle, priority, badgeType })
            // Closing right after a save must not ask about the edits that were
            // just saved.
            baselineRef.current = snapshot()
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [books, advanced, tabTitle, priority, badgeType])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-source-settings">
        <label class="gm-sp-editor-row">
          <span>Tab 标题</span>
          <input
            type="text"
            class="gm-sp-input"
            placeholder="留空使用默认"
            value={tabTitle}
            onInput={(e) => setTabTitle((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>优先级</span>
          <input
            type="number"
            class="gm-sp-input"
            value={priority}
            onInput={(e) => setPriority(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>Badge 显示</span>
          <select
            class="gm-sp-input"
            value={badgeType}
            onChange={(e) => setBadgeType((e.target as HTMLSelectElement).value as BadgeType)}
          >
            <option value="default">默认</option>
            <option value="none">不显示</option>
            <option value="allUnread">全部未读数</option>
          </select>
        </label>
      </div>
      <EditorListToolbar
        query={query}
        onQuery={(value) => {
          setQuery(value)
          setPage(0)
        }}
        queryPlaceholder="搜索书名或来源 URL"
        status={status}
        onStatus={(value) => {
          setStatus(value)
          setPage(0)
        }}
        statusOptions={BOOK_STATUSES.map((value) => ({ value, label: BOOK_STATUS_LABELS[value] }))}
        counter={
          visible.length === books.length
            ? `共 ${books.length} 本书`
            : `共 ${books.length} · 命中 ${visible.length}`
        }
        page={currentPage}
        pageCount={pages}
        onPage={setPage}
        selection={{
          selectedCount: selectedVisible.length,
          allSelected: visible.length > 0 && selectedVisible.length === visible.length,
          onSelectAll: (checked) => {
            setSelected(checked ? new Set(visibleKeys) : new Set())
          },
          actions: [
            { label: '删除', action: 'bulk-remove', onClick: () => setConfirmRemove(true) },
          ],
        }}
      >
        <button
          type="button"
          class="gm-sp-editor-btn gm-sp-btn"
          data-action="expand-all"
          onClick={() => setExpanded(new Set(visibleKeys))}
        >
          全部展开
        </button>
        <button
          type="button"
          class="gm-sp-editor-btn gm-sp-btn"
          data-action="collapse-all"
          onClick={() => setExpanded(new Set())}
        >
          全部折叠
        </button>
      </EditorListToolbar>

      {confirmRemove ? (
        <div class="gm-sp-editor-confirm-inline" data-action="bulk-remove-guard">
          <span>{`删除选中的 ${selectedVisible.length} 本书？该操作不可撤销。`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-danger"
            data-action="bulk-remove-confirm"
            onClick={removeSelected}
          >
            删除
          </button>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn"
            onClick={() => setConfirmRemove(false)}
          >
            取消
          </button>
        </div>
      ) : null}

      <div class="gm-sp-editor-list">
        {rows.length === 0 ? (
          <div class="gm-sp-editor-empty">
            {books.length === 0 ? '尚未添加书库' : '没有符合条件的书库'}
          </div>
        ) : (
          rows.map((book) => {
            const bookIdx = books.indexOf(book)
            const key = keyOf(book)
            const cached = titleMap.get(book.urls[0] ?? '')
            const displayTitle = book.title || cached || book.urls[0] || '(未命名)'
            const open = expanded.has(key)
            const sourceCount = book.urls.length
            return (
              <div
                class={`gm-sp-ne-book${open ? ' gm-sp-ne-book-open' : ''}`}
                key={key}
                data-book-key={key}
              >
                {/*
                  The whole row toggles, not just the ▸: a 12px triangle is not
                  a click target. The pick box and 删除 stop propagation so they
                  keep their own meaning.
                */}
                <div
                  class="gm-sp-ne-book-head"
                  data-action="book-head"
                  onClick={() => toggleExpanded(key)}
                >
                  <label class="gm-sp-ne-book-pick" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      data-action="book-pick"
                      checked={selected.has(key)}
                      onChange={() => toggleSelected(key)}
                    />
                  </label>
                  <span class="gm-sp-re-feed-toggle" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span class="gm-sp-ne-book-display" title={displayTitle}>
                    {displayTitle}
                  </span>
                  <span class="gm-sp-ne-book-meta">
                    {sourceCount === 0 ? '无来源' : `${sourceCount} 个来源`}
                  </span>
                  <button
                    type="button"
                    class="gm-sp-item-remove"
                    aria-label="remove book"
                    title="删除整本书"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeBook(bookIdx)
                    }}
                  >
                    <DeleteIcon />
                  </button>
                </div>
                {open ? (
                  <div class="gm-sp-ne-book-detail">
                    <label class="gm-sp-editor-row">
                      <span>书名</span>
                      <input
                        type="text"
                        class="gm-sp-input gm-sp-ne-book-title"
                        placeholder="留空用书库标题"
                        value={book.title}
                        onInput={(e) => setBookTitle(bookIdx, (e.target as HTMLInputElement).value)}
                      />
                    </label>
                    {book.urls.map((url, urlIdx) => {
                      const unknown = isUnknownHost(url)
                      return (
                        <div class="gm-sp-editor-item gm-sp-ne-source" key={`${key}:${urlIdx}`}>
                          {/* Empty for the 2nd+ source: the column stays, the
                              text would only repeat itself. */}
                          <span class="gm-sp-ne-source-label">{urlIdx === 0 ? '来源' : ''}</span>
                          {/* Url and badge share one cell: a hidden badge must not
                              shift the buttons that follow it. */}
                          <div class="gm-sp-ne-source-url">
                            <input
                              type="url"
                              class="gm-sp-input gm-sp-ne-item-url"
                              data-action="book-url"
                              value={urlDrafts[url] ?? url}
                              onInput={(e) =>
                                setUrlDrafts((prev) => ({
                                  ...prev,
                                  [url]: (e.target as HTMLInputElement).value,
                                }))
                              }
                              onBlur={() => commitUrl(bookIdx, urlIdx, url)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  commitUrl(bookIdx, urlIdx, url)
                                }
                              }}
                            />
                            <span class="gm-sp-ne-item-warn" hidden={!unknown}>
                              未知站点
                            </span>
                          </div>
                          <button
                            type="button"
                            class="gm-sp-item-move"
                            aria-label="move up"
                            disabled={urlIdx === 0}
                            onClick={() => moveUrl(bookIdx, urlIdx, -1)}
                          >
                            <ArrowUpIcon />
                          </button>
                          <button
                            type="button"
                            class="gm-sp-item-move"
                            aria-label="move down"
                            disabled={urlIdx === book.urls.length - 1}
                            onClick={() => moveUrl(bookIdx, urlIdx, 1)}
                          >
                            <ArrowDownIcon />
                          </button>
                          <button
                            type="button"
                            class="gm-sp-item-remove"
                            aria-label="remove"
                            onClick={() => removeUrl(bookIdx, urlIdx)}
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      )
                    })}
                    <div class="gm-sp-ne-addurl">
                      <input
                        ref={(el) => {
                          urlInputRefs.current[bookIdx] = el
                        }}
                        type="url"
                        class="gm-sp-input"
                        placeholder="添加同本书的其它来源，如 https://www.deqixs.org/97/"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitAddUrl(bookIdx)
                          }
                        }}
                      />
                      <button
                        type="button"
                        class="gm-sp-btn gm-sp-editor-btn"
                        onClick={() => commitAddUrl(bookIdx)}
                      >
                        添加来源
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      <div class="gm-sp-editor-form-stacked">
        <label class="gm-sp-editor-row">
          <span>书名（可选）</span>
          <input
            ref={bookTitleRef}
            type="text"
            class="gm-sp-input"
            placeholder="书名（可选）"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>书库 URL</span>
          <input
            ref={urlRef}
            type="url"
            class="gm-sp-input"
            placeholder="https://www.sudugu.org/166/"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="add"
          onClick={handleAdd}
        >
          添加书库
        </button>
      </div>
      <div class="gm-sp-editor-advanced">
        {ADVANCED_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{fieldLabel(f)}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              class="gm-sp-input"
              min={f.min}
              value={advanced[f.prop]}
              onInput={(e) =>
                onAdvancedChange(f.prop, Number((e.target as HTMLInputElement).value))
              }
            />
          </label>
        ))}
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createNovelsEditor(
  options: NovelsEditorOptions,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const titleMap = await options.getCachedTitles()
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <NovelsEditorForm
        fresh={fresh}
        titleMap={titleMap}
        settings={settings}
        ctx={ctx}
        handleRef={handleRef}
      />,
      container,
    )
    const declared = handleRef.current?.size
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
      // Same contract as `createEditorFactory`: a form that edits fifty books
      // declares the room it needs and whether closing would lose work.
      ...(declared ? { size: declared } : {}),
      isDirty: () => handleRef.current?.isDirty?.() ?? false,
    }
  }
}
