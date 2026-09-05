# novels 多源抓取

## Goals

- 同一本书可以配置多个站点源，各自进度不同也能正确合并成一本书的更新流。
- 跨站判定「同一章」，已读状态不因换源/换镜像而重置。
- 同一章在某个源上没有时，仍能从有它的源进入阅读。
- 某个源抓取失败不影响其它源。

## Non-goals

- 不做源之间的正文质量/翻译对比与自动选优。
- 不对「落后源」降频（多源即 N 倍首页请求，靠现有 TTL 收敛）。
- 不处理分卷导致章节号从 1 重新开始的情况（见 Risks）。
- 不接线 `maxLatestWindow`（既有遗留问题，本次不动）。

## 现状约束（为什么不能只加字段）

- `NovelBook` 以 `url` 为唯一身份，`lastSeenChapterUrl` 也是 URL —— 跨站 URL 必然不同，两者都要换成与站点无关的身份。
- `mirrorHost` 是 book 级的，多源后必须下沉到「每章每个源」。
- `NovelEntry = { url, alias? }` 是扁平的，一本书的多个源无法表达。

## 设计决策（已确认）

1. **配置结构重构为嵌套**：`novels.books: [{ title: string, urls: string[] }]`，不再有 `entries`。
2. **每章列出所有源的链接**，不做单一优选。
3. **章节同一性**：章节号优先（`n:<num>`），抽不到序号时退化到归一化标题（`t:<normalized>`）。

## 数据模型

### 配置侧（`types.ts`）

```ts
export type NovelBookConfig = {
  /** 展示名，可为空（抓取后回填）。不参与身份计算。 */
  title: string
  /** 源 URL，按优先级排序；index 0 为主源，决定标题/时间戳取值与 chip 顺序。 */
  urls: string[]
}

export type NovelSourceOptions = {
  books: NovelBookConfig[]
  ttlMinutes: number
  maxNewChaptersPerBook: number
  initialNewChapters: number
  maxLatestWindow: number
}
```

### 运行时侧（`types.ts`）

```ts
/** 某一章在某个站点上的具体形态。 */
export type NovelChapterVariant = {
  url: string
  title: string
  postedAt: number
  siteId: string
  /** 实际提供内容的 host（镜像），用于渲染时改写链接。 */
  host?: string
}

export type NovelChapter = {
  /** 跨站身份：`n:<num>` 或 `t:<normalized title>`。 */
  key: string
  number?: number
  /** 展示标题，取优先级最高的 variant。 */
  title: string
  /** 取优先级最高的非零 postedAt。 */
  postedAt: number
  /** 按源优先级排序（index 0 = 主源）。 */
  variants: NovelChapterVariant[]
  omittedCount?: number // gap 标记，语义不变
}

/** 单个源 URL 的抓取结果。 */
export type NovelSourceState = {
  url: string
  siteId: string
  mirrorHost?: string
  /** 该站目录总章数，用于书头进度摘要；不可用为 0。 */
  chapterCount: number
  error: string // '' 表示成功
}

export type NovelBook = {
  /** 稳定身份：`u:${urls[0]}`。与标题解耦，改名不丢已读状态。 */
  id: string
  title: string
  sources: NovelSourceState[]
  latestChapters: NovelChapter[]
  lastSeenChapterKey: string // '' = 尚未读过
  fetchedAt: number
}
```

删除：`NovelEntry`、`NovelBook.url/siteId/lastSeenChapterUrl/error/mirrorHost`（后三者下沉到 `sources[]`）。

## 关键算法

### `chapter-key.ts`（新，纯函数）

- `chapterNumber(title): number | undefined`
  - 全角转半角后匹配 `第\s*(阿拉伯|中文数字)\s*[章节節回集卷篇话話]`，以及行首 `123.` / `123、` / `123 ` 形式。
  - 中文数字解析支持 0–9999（十/百/千/零/两）。
- `normalizeTitle(title)`：`NFKC` → 去空白与标点（`[\p{P}\p{S}\s]`）→ 小写。
- `chapterKey(title): string` → `n:<num>`，无序号时 `t:<normalized>`。

### `merge.ts`（新，纯函数）

`mergeSourceChapters(inputs, seenKey, options) -> NovelChapter[]`

1. 每个源算 `keys[i]`（保持 newest-first）。
2. **spine** = 章数最多的源（并列取源序号最小者）。
3. 沿 spine newest-first 输出合并节点：从所有含该 key 的源收集 variant（按源序号排序），标题与时间戳取**优先级最高的非零值**。
4. **extras**：非 spine 源，取其 newest-first 列表中「第一个出现在 spine 里的 key」之前的前缀（即比 spine 多出来的新章）。多个源都有 extras 时，按 `chapterCount` 降序、再按源序号升序排列，整体前置到 spine 输出之前。
5. 按 `seenKey` 截断（`slice(0, idx + 1)`；找不到则全留，与现有一致）。
6. 折叠：沿用现有 `collapseChapters` 逻辑，但比较键从 `url` 换成 `key`。

### `fetcher.ts`

- 现有「镜像回退 + tail 分页」逻辑整体下沉为 `fetchSourceChapters(runtime, sourceUrl, prev, adapter) -> { chapters, siteId, mirrorHost, error }`，行为不变。
- `fetchNovels(books, prevBooks, options)`：按书遍历 → 书内各源并行 → `mergeSourceChapters` → 组装 `NovelBook`。
- prev 查找：`id` 命中优先；未命中时回退到「任一源 URL 相同」（覆盖改名/换主源）。

### `migrate.ts`（新）

`normalizeBook(raw, ): NovelBook` —— 所有读取缓存 `NovelData` 的入口统一调用（`source.tsx` 的 `markSeen` / `mergeLatestSeen` / `loadCachedTitleMap`，以及 fetcher 的 `prevBooks`）。旧数据迁移规则：

- `id` ← `u:${url}`；`sources` ← 单元素（`siteId` / `mirrorHost` / `error`）。
- `latestChapters[].variants` ← 单元素（`siteId` 与 `host` 取 book 级值）；`key` ← `chapterKey(title)`。
- `lastSeenChapterKey` ← 在旧 `latestChapters` 中按 `lastSeenChapterUrl` 找到那一章，取其 `chapterKey`；找不到则 `''`。

## 兼容与迁移

- `editor/types.ts` 的 `coerceNovelsOptions`：raw 有 `entries` 且无 `books` 时，按 URL 各自成书、`title ← alias ?? ''`。
- `config/defaults.ts`：`novels.books: []`（删 `entries`）。
- `config/validate.ts`：校验 `books`（每项对象、`title` 为 string、`urls` 非空数组且元素为合法 URL、同一 URL 不得跨书重复）；**保留 legacy `entries` 分支**，老导出文件仍可导入。
- `prism/types.ts`：配置类型跟随改为 `books`。
- `codec.ts`：`compressNovelBook` / `expandNovelBook` 适配新结构，expand 侧调用 `normalizeBook` 兼容旧载荷。

## UI

- **单源书**：外观与今天完全一致（整行是一个链接），不引入回归。
- **多源书**：
  - 书头加一行进度摘要（小字）：`sudugu 120 · biquge 118`；失败源显示 `⚠ sudugu`。
  - 章节行 = 时间 + 标题 + 链接 chip 组，每个 variant 一个 chip，文案取配置 URL 的 hostname 去 `www.` 后首段（`sudugu`、`biquge`），`title` 属性写完整 host。chip 顺序 = 源优先级。
- 新增 CSS 类：`.gm-sp-novels-chapter-sources` / `.gm-sp-novels-chapter-src` / `.gm-sp-novels-book-sources`。
- **编辑器**：列表按书分组（书名输入 + 每个 URL 一行，带未知站点标记与删除/上下移动按钮）；添加区为「书名 + 书库 URL」，书名已存在则追加源，重复 URL 报重复。

## 实施步骤

每步结束都应能 `bun run typecheck` 或对应测试通过。

1. 新增 `chapter-key.ts` + `test/prism/novels/chapter-key.test.ts`（纯函数，先把中文数字/全角/无序号三类测透）。
2. `types.ts` 换新模型；新增 `migrate.ts` + 测试。
3. 新增 `merge.ts` + `test/prism/novels/merge.test.ts`（重点：两源进度不同、单源、源失败、seen 定位、折叠、extras 排序）。
4. `fetcher.ts` 改造（抽出 `fetchSourceChapters`，接入 merge）；更新 `fetcher.test.ts`。
5. `state.ts` 改 key 语义；`mirror.ts` 改 per-variant 取链；更新 `state.test.ts`。
6. `source.tsx`：`markSeen` / `mergeLatestSeen` / `persistFetchedTitles` 按 book id；更新 `source.test.ts`。
7. 配置层：`defaults.ts` / `validate.ts` / `prism/types.ts` / `editor/types.ts`；更新 `config-validate.test.ts` 相关用例。
8. `editor/form.tsx` UI；更新 `editor.test.tsx`。
9. `component.tsx` + `overlay/novels.css`；更新 `render.test.tsx`。
10. `codec.ts` 适配；更新 `codec.test.ts`。
11. `bun run check` 收尾。

## 涉及文件

新增：`src/prism/novels/chapter-key.ts`、`src/prism/novels/merge.ts`、`src/prism/novels/migrate.ts`、`test/prism/novels/chapter-key.test.ts`、`test/prism/novels/merge.test.ts`

修改：`src/prism/novels/{types,fetcher,state,mirror,source,component}.tsx?`、`src/prism/novels/editor/{form.tsx,types.ts,helpers.ts}`、`src/prism/overlay/novels.css`、`src/prism/config/{defaults.ts,validate.ts}`、`src/prism/types.ts`、`src/prism/codec.ts`

测试：`test/prism/novels/{fetcher,state,source,editor,render}.*`、`test/prism/config-validate.test.ts`、`test/prism/codec.test.ts`

## Risks

- **章节号重排**：分卷从 1 重新编号会让不同卷的章合并成一章，未读数偏小。接受，文档注明。
- **标题被站点改写**：仅当抽不出序号时才依赖标题，此时改标题会漏判（未读数虚高）。同现状。
- **中文数字上限 9999**：超出退化为标题匹配。
- **换主源**：`id = u:${urls[0]}`，主源变化且旧主源被删除时会丢已读状态（前一次 prev 查找的 URL 回退能覆盖大部分情况）。
- **请求量翻倍**：N 个源即 N 次首页（含分页）请求，只靠 TTL 60 分钟节流。
- **`fetcher.test.ts` 改动面大**（696 行，大量按 url 断言），预计需要成体系重写夹具。
