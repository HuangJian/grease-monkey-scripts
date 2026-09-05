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

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
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
      <div class="gm-sp-editor-list">
        {books.length === 0 ? (
          <div class="gm-sp-editor-empty">尚未添加书库</div>
        ) : (
          books.map((book, bookIdx) => {
            const cached = titleMap.get(book.urls[0] ?? '')
            const displayTitle = book.title || cached || book.urls[0] || '(未命名)'
            return (
              <div class="gm-sp-ne-book" key={bookIdx}>
                <div class="gm-sp-ne-book-head">
                  <input
                    type="text"
                    class="gm-sp-input gm-sp-ne-book-title"
                    placeholder="九龙夺嫡"
                    value={book.title}
                    onInput={(e) => setBookTitle(bookIdx, (e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    class="gm-sp-item-remove"
                    aria-label="remove book"
                    title="删除整本书"
                    onClick={() => removeBook(bookIdx)}
                  >
                    ×
                  </button>
                </div>
                <span class="gm-sp-ne-book-display">{displayTitle}</span>
                {book.urls.map((url, urlIdx) => {
                  const unknown = isUnknownHost(url)
                  return (
                    <div class="gm-sp-editor-item" key={`${bookIdx}:${urlIdx}`}>
                      <span class="gm-sp-ne-item-url">{url}</span>
                      <span class="gm-sp-ne-item-warn" hidden={!unknown}>
                        未知站点
                      </span>
                      <button
                        type="button"
                        class="gm-sp-item-move"
                        aria-label="move up"
                        disabled={urlIdx === 0}
                        onClick={() => moveUrl(bookIdx, urlIdx, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        class="gm-sp-item-move"
                        aria-label="move down"
                        disabled={urlIdx === book.urls.length - 1}
                        onClick={() => moveUrl(bookIdx, urlIdx, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        class="gm-sp-item-remove"
                        aria-label="remove"
                        onClick={() => removeUrl(bookIdx, urlIdx)}
                      >
                        ×
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
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
