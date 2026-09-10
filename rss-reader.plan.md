# RSS 阅读器 · 实施计划

本计划为 Prism 仪表盘新增一个 `rss` 数据源卡片：用户自定义订阅源列表，自动抓取 RSS/Atom，按「分组 / 时间线」两种视图展示未读条目，支持 OPML 导入导出。

风格基线：`src/prism/novels/`（多源分组 + 折叠 + 编辑器表单）与 `src/prism/tnews/`（RSS 解析 + 已读状态 + ExpandableList）。

已确认参数：`ttlMinutes = 123`、`retentionDays = 30`、`maxItemsPerFeed = 100`；`@match` 暂不扩大；OPML 导入导出纳入 v1。

---

## 1. 目标与非目标

### 目标

- 用户可在 Prism 的编辑器弹窗里增删订阅源（URL + 自定义标题 + 启停），配置持久化到 `Config.rss`。
- **OPML 导入导出**：导出当前订阅列表为标准 OPML 2.0 文件；导入 OPML（支持嵌套分类目录展平）按 URL 去重合并进现有列表。
- 定时抓取（TTL）+ 机会性刷新沿用现有基建：缓存、锁、`429/失败`退避、导出导入，全部零新增代码。
- 支持 RSS 2.0 / Atom 1.0 / RDF 三种 feed 格式；单源失败不影响其它源。
- 未读/已读/隐藏状态复用 `createItemState`，支持「本条以上全部已读」。
- 两种视图：按订阅源分组折叠（默认）、全局时间线。
- 卡片 tab 显示未读徽标。

### 非目标（v1 不做）

- 全文抓取 / 离线阅读。
- 站内 feed 自动发现（读 `<link rel="alternate">`）。
- 分类/文件夹（导入时可读取 OPML 的目录结构，但 v1 展平，不建模）。
- 单源独立刷新间隔、推送通知。
- 扩大 prism 的 `@match`（见 §8 O1，已决定不动）。

---

## 2. 现状关键发现

| 发现                                | 位置                                                                                                                                                                                                                   | 影响                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **tnews 已经是一套单源 RSS 阅读器** | `src/prism/tnews/parser.ts:47` `parseItem`、`:61` `parseItemsFromXml`（仅 RSS 2.0 `<item>`）、`src/prism/tnews/state.ts`（`createItemState` + 展开态）、`src/prism/tnews/component.tsx`（`ExpandableList` + 已读标记） | 解析器应上提到 shared 共用，而不是写第二份                                 |
| **`@connect *` 已存在**             | `src/prism/index.user.ts:27`                                                                                                                                                                                           | 跨域抓取无需改元数据                                                       |
| 挂载无 hostAllowlist 门禁           | `src/prism/app/index.ts` `startDashboard` 无条件执行；`hostAllowlist` 只作用于快捷键（`app/shortcut-bootstrap.ts:13`）                                                                                                 | 唯一开关是 `@match`，本轮不动                                              |
| 未读状态基建成熟                    | `src/prism/item-state.ts:40` `createItemState`（读/隐藏 + TTL 过期）、`src/prism/item-actions.ts:63` `createGroupedItemHandlers`（分组内批量已读）                                                                     | 直接复用，无需自建                                                         |
| 列表渲染可复用                      | `src/prism/shared/expandable-list.tsx:100` `ExpandableList`（时间、展开、隐藏、滚动）                                                                                                                                  | 两种视图都用同一组件，交互与 tnews 一致                                    |
| 导入导出已有范式                    | `src/prism/export-import.ts:34` `downloadJson`（Blob + `URL.createObjectURL` + a.click）、`:47` `readImportFile`（`FileReader`）                                                                                       | OPML 走同一条路：抽 `downloadText` / `readTextFile`，`downloadJson` 复用之 |
| 并发控制已有                        | `src/prism/shared/concurrency.ts` `mapLimit`                                                                                                                                                                           | 抓取必须限流，不能裸 `Promise.all`                                         |
| 缓存压缩按 source id 注册           | `src/prism/codec.ts` `CODECS`（`v2ex`/`tnews`/`novels`…），shape 有 `array`/`grouped`/`novels`                                                                                                                         | `rss` 走 `array` shape 最省事（顶层是 `RssFeed[]`）                        |
| 配置三段式                          | `config/types.ts` → `config/defaults.ts` → `config/validate.ts`（字段白名单 + 数值区间 + URL 去重）                                                                                                                    | 新增 section 必须三处同步，否则 `loadConfig` 校验失败回落默认              |
| 特征 CSS 独立文件                   | `src/prism/overlay/novels.css`，由 `src/prism/index.css` 统一 `@import`                                                                                                                                                | 新建 `rss.css` 并加一行 import                                             |

---

## 3. 设计决策

### D1 归属：Prism 新 source 卡片

`createRssSource(config.rss, runtime)` 注册进 `source-registry.ts`，`groupId: 'browse'`、`order: 6`。不新建独立 userscript。

- 🚨 **`order` 取 6，不是 3**（评审 R5，已核对）：`order` 在 **同一 group 内**参与排序（`card-group.ts:39-41`，`sourceSettings[].priority ?? order ?? 0`），而 `browse` 组现有成员已占满 0–5：v2ex=0（`v2ex/source.tsx:70`）、tnews=1（`tnews/source.tsx:29`）、novels=2（`novels/source.tsx:25`）、**reddit=3（`reddit/source.tsx:72`）、hupu=4（`hupu/source.tsx:70`）、xueqiu-news=4 / xueqiu-hot=5（`xueqiu/source.tsx:65,157`）**；misc=10（`misc/source.tsx:49`）是尾部锚点。取 6 落在 xueqiu-hot 之后、misc 之前，不冲突。
- ⚠️ **注册方式：写进 `sources` 数组字面量，不做条件 push**（评审 R4，已核对并修正）：`source-registry.ts:33` 是数组字面量，`:44`（xit，条件）与 `:46`（misc，无条件）都用 push——两种写法在库里都存在。rss 选择**无条件进字面量**，理由：`novels` 在 `books: []` 时同样注册并显示空态卡片，rss 需要同样的「空态引导用户去添加源」路径；条件注册反而会让用户在配置前找不到入口。

### D2 数据形状：`Source<RssFeed[], 'rss'>`

顶层是数组而非 `{ feeds }`，这样 codec 可复用 `array` shape（`codec.ts:386`），无需新增 `CodecShape` 分支。每个 `RssFeed` 自带 `items` 与 `error`，单源失败就地可见。

- ⚠️ **`array` shape 只逐顶层元素调用，不做递归**（评审 R1，已核对）：`codec.ts:386-389` 是 `data.map(v => fn(v))`，只作用于 `RssFeed` 本身，**不会**自动处理内嵌的 `items: RssItem[]`。因此 `compressRssFeed` / `expandRssFeed` 必须自己在内部对 `items` 做 `items.map(compressRssItem)` / `items.map(expandRssItem)`——与 `novels` 的 `compressNovelBook` 内部映射 `lc: latestChapters.map(compressNovelChapter)` 是同一个套路。选 `array` shape 省的是**新增 `CodecShape` 分支**，不是省掉嵌套压缩代码；下文 D8 的 `{i,t,u,e,fa,it:[{i,t,l,p,s}]}` 即指这个嵌套。

### D3 解析层上提到 `src/prism/shared/feed-parser.ts`

新文件导出：`parseFeed(xml, domParser, options) → { title, items }`，内部按 RSS 2.0 `<item>` / Atom `<entry>` / RDF `<item>` 三种形态探测；以及 `normalizeLink`、`extractTitle`、`stripHtmlToText`、`sanitizeFeedHtml`、`parsePubDateMs`。

- ⚠️ **tnews 适配方式（评审 R2，已核对并修正）**：tnews 现有代码**没有** `requirePubDate` 参数——`parseItem(item, domParser)`（`tnews/parser.ts:20`）里是硬编码的 `if (!pubDate) return null`（`:30`），无 pubDate 的条目直接被丢弃；`parseRssItems(xml, domParser)`（`:52`）也只有两个入参。因此迁移做法是：
  - shared `parseFeed` **默认保留**无 pubDate 的条目（RSS 阅读器需要，很多 feed 不写日期）；
  - tnews 薄适配在调用 shared 之后自行 `.filter(it => it.pubDate > 0)`，保持现有行为不变。
  - 即 `requirePubDate` 是**新增的 shared 选项**，不是现有参数——不得照字面去改 tnews 的入参。
- ⚠️ **`extractTitle` 不是 private（评审 R11，事实不成立，已驳回）**：`tnews/parser.ts:62` 明确 `export function extractTitle(`，并经 `tnews/index.ts:13` 再导出，`test/prism/sources/tnews/parser.test.ts:93` 直接 import 它做单测。故上提到 shared 时**保持导出**：shared 内部用它，tnews/index.ts 继续再导出，现有测试无需改动。评审「RSS 阅读器不需要自己调它」的判断成立——rss 侧不直接调用，只由 `parseFeed` 内部使用。
- 理由：AGENTS.md 明令禁止复制既有实现；两份 RSS 解析并存会让后续 bug 修两遍。

### D4 item 身份：`normalizeLink(link)`

与 tnews 一致（`normalizeLink` 已做 hostname 小写、去 hash、去尾斜杠）。feed 身份 `feedId = u:${url}`（照抄 novels 的 `bookId`）。改源 URL 会重置该源已读态——与 novels 行为一致，可接受。

- ⚠️ **R1 实测修正：去掉 `|| guid` 兜底**。原计划写 `normalizeLink(link) || guid`，但实现时该分支**不可达**：entry 无 link 时已在 `parseEntry` 开头被丢弃，而 `normalizeLink` 对非空输入永不返回空串（解析失败时原样返回入参）。已简化为 `id = normalizeLink(link)`，并在 shared 里注明「不拿 guid 当兜底，因为 feed 重新生成时 guid 会变，而 link 稳定」。shared 测试「identity is the canonical link, not the guid」锁死此行为。

### D5 抓取：并行限流 + 单源错误隔离

`fetchRssFeeds` 用 `mapLimit(configs, fetchOne, 4)`；单源失败写入该 feed 的 `error` 且保留 `prev` 的 items（与 novels `fetchOneBook` 一致：部分成功不算失败）。**全部源失败才 throw**，触发 `refreshSource` 的失败退避。请求头沿用 tnews：`User-Agent` + `Accept: application/rss+xml, application/xml, text/xml, */*`，超时用 `DEFAULT_REQUEST_TIMEOUT_MS`（15s）。

- 🚨 **`mapLimit` 是 fail-fast，错误隔离必须由 `fetchOne` 自己实现**（评审 R6，已核对）：`concurrency.ts:43` 在任一 mapper reject 时 `settled = true; reject(err)`，语义等同 `Promise.all`——**第一个 rejection 会丢弃其余结果并终止调度**，`mapLimit` 本身没有「部分成功」概念。故实现约束为：
  1. `fetchOne` 内部 `try/catch`，**永远 resolve**，失败时返回 `{ ...prev, error: message, items: prev?.items ?? [] }`；
  2. `fetchRssFeeds` 拿到全部结果后判断「是否全部 error」，是才 `throw`（交给 `refreshSource` 记 `failureCount` / `nextRetryAt`）。
  - 这与 novels `fetchOneBook`（`novels/fetcher.ts:135-155` 内部 catch，返回 `failed: true` 的结果对象）是同一套路，照抄即可。

### D6 两种视图 + 共用 `ExpandableList`

- 分组视图：`feeds.map(f => <FeedBlock>)`，每块 = 源标题链接 + 未读徽标 + 错误提示 + 一个 `ExpandableList`（items = 未读，超过 `foldThreshold` 折叠成前 2 条 + 「还有 N 条」按钮，照 novels `ChapterList`）。
- 时间线视图：一个 `ExpandableList`，items = 所有源未读按 `pubDate` 倒序，行内用 `renderExtra` 显示源名小标签。
- 切换按钮放在组件顶部一行（两个 `gm-sp-btn` + `data-action="view-grouped"` / `"view-timeline"`），视图选择写回 `Config.rss.viewMode`。

### D7 已读状态：`createRssState`

`createItemState<string>({ storageKey: STATE_KEY('rss'), ttlMs: retentionMs + 1d })`（`src/prism/keys.ts` 已有 `STATE_KEY`）＋ `createExpandedState`。TTL 比数据保留期多一天，与 tnews 注释同理（避免 fetch 失败时状态早于数据消失）。

### D8 缓存压缩

`codec.ts` 新增 `rss` 条目（shape `array`，version `CACHE_CODEC_VERSION`），字段缩写 `{i,t,u,e,fa,it:[{i,t,l,p,s}]}`，时间戳走现成的 `compressTimestamp/expandTimestamp`（分钟精度）。

- ⚠️ **重复压缩守卫复用 `isShortItem`，不新增 `isShortFeed`**（评审 R12，已核对）：`codec.ts:44` 的 `isShortItem(v)` 判定 `typeof v.t === 'string'`；压缩后 feed 的 `title` 变 `t`，未压缩的 feed 只有 `title` 没有 `t`，因此同一守卫对 feed 一样成立。保持单一嗅探函数，避免两种判定逻辑漂移。
- 嵌套压缩：`compressRssFeed` 内部 `items.map(compressRssItem)`（见 D2 的修正说明），`expandRssFeed` 对称还原。

### D9 摘要存纯文本，不存 HTML（**因 100 条/源而新增的决策**）

`RssItem.summaryText` = sanitize → `stripHtmlToText` → 截断到 `MAX_SUMMARY_CHARS = 300`（超出加 `…`）。展开区渲染纯文本 + 「打开原文」链接（`escapeUrl`）。

- 理由一（体积）：100 条 × N 源，存完整 HTML 会轻易把 GM 缓存推到数 MB（见 §8 风险 2 + R5 实测门槛）。
- 理由二（规范）：AGENTS.md 要求「Preact 树内不用 `dangerouslySetInnerHTML`，结构化内容渲染成 JSX 子节点」。tnews 的 `dangerouslySetInnerHTML` 是历史先例，新代码不跟随。
- 代价：摘要里的图片与内嵌链接不再可见。RSS 摘要的用途是「判断是否值得点开」，正文点原文。若你要保留富文本，请驳回本条，我改回 sanitize 后的 HTML（并把 `maxItemsPerFeed` 建议调回 20–30）。
- ✅ **评审 R10 已认可本条**，并补充了升级路径：将来若要富文本摘要，方向是「解析成 typed token 数组再用 JSX 渲染」（AGENTS.md 原文要求），**不是**退回到 `dangerouslySetInnerHTML`。此路径不在 v1 范围内。

### D10 OPML 序列化

`src/prism/rss/opml.ts` 为纯函数模块（只吃 `string` + `DOMParser`，不碰 `Runtime`）：

- `buildOpml(feeds: RssFeedConfig[]): string` —— OPML 2.0，`<outline type="rss" text title xmlUrl>`，属性值用 `src/utils.ts` 的 `escapeHtml` 转义。
- `parseOpml(xml, domParser): RssFeedConfig[]` —— 递归遍历 `<outline>`，收集所有带 `xmlUrl` 的节点（父级分类目录的 `text` 在 v1 忽略，结构展平），做 URL 可解析性校验与按 URL 去重；非法 XML 返回空数组而非抛错。

编辑器交互：

- 「导出 OPML」→ `downloadText(runtime, buildOpml(feeds), 'gm-rss-subs.opml', 'text/x-opml')`，直接下载文件。
- 「导入 OPML」→ `<input type="file" accept=".opml,.xml,text/xml">` + `readTextFile(file)` → `parseOpml` → **合并**（按 URL 去重，已存在则跳过；可选「用导入的标题覆盖」先不做）→ 回显「新增 N 个，跳过 M 个（已存在 / 无效）」。
- 导入只改内存中的表单 state，点「保存」才落盘，与其它编辑项一致。

---

## 4. 数据模型

```ts
// src/prism/rss/types.ts
export type RssFeedConfig = { url: string; title: string; enabled?: boolean }

export type RssItem = {
  id: string // normalizeLink(link) || guid
  title: string
  link: string
  pubDate: number // ms, 0 = 未知
  summaryText: string // 纯文本摘要，已截断（D9）
  author?: string
}

export type RssFeed = {
  id: string // `u:${url}`
  title: string // config.title || feed 自报 title || hostname
  url: string
  items: RssItem[] // 已按 pubDate 倒序、已裁剪
  error: string // '' = ok
  fetchedAt: number
}

export type RssSourceOptions = {
  feeds: RssFeedConfig[]
  ttlMinutes: number
  retentionDays: number
  maxItemsPerFeed: number
  viewMode: 'grouped' | 'timeline'
}
```

默认值（已确认）：`feeds: []`、`ttlMinutes: 123`、`retentionDays: 30`、`maxItemsPerFeed: 100`、`viewMode: 'grouped'`。

常量（`rss/constants.ts`）：`FEED_FETCH_CONCURRENCY = 4`、`FOLD_THRESHOLD = 3`、`MAX_SUMMARY_CHARS = 300`、`USER_AGENT`（与 tnews 同值）、`ACCEPT_HEADER`。

---

## 5. 文件清单

### 新增

```
src/prism/shared/feed-parser.ts        # D3：RSS/Atom/RDF 解析 + 日期/标题/链接工具
src/prism/rss/types.ts                 # 数据模型（叶子，零内部 import）
src/prism/rss/constants.ts             # UA、并发上限、折叠阈值、摘要截断长度
src/prism/rss/fetcher.ts               # D5：mapLimit 抓取 + 单源错误隔离
src/prism/rss/merge.ts                 # 去重/裁剪/排序（纯函数）
src/prism/rss/state.ts                 # D7：已读 + 展开态
src/prism/rss/opml.ts                  # D10：OPML 构建与解析（纯函数）
src/prism/rss/component.tsx            # D6：两种视图
src/prism/rss/source.tsx               # Source 定义 + tabLabel + loadFreshOptions
src/prism/rss/index.ts                 # 对外只导出 createRssSource + 类型
src/prism/rss/editor/types.ts          # ADVANCED_FIELDS + coerceRssOptions
src/prism/rss/editor/helpers.ts        # hostnameFor / loadFreshOptions
src/prism/rss/editor/form.tsx          # 源列表 CRUD + OPML 导入导出 + 高级字段
src/prism/overlay/rss.css              # gm-sp-rss-* 样式
test/prism/rss/{fetcher,merge,state,opml}.test.ts
test/prism/rss/{component,editor}.test.tsx
test/prism/shared/feed-parser.test.ts  # shared 解析器唯一测试处（评审 R13：不在 rss/ 下建重复用例）
```

### 修改

| 文件                                 | 改动                                                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/prism/tnews/parser.ts`          | 改为调用 `shared/feed-parser.ts`，保留全部导出签名（含 `extractTitle`）；「丢弃无 pubDate 条目」的行为改为适配层调 shared 后自行 `.filter(it => it.pubDate > 0)`（行为不变，见 D3）                                                                                   |
| `src/prism/config/types.ts`          | `Config.rss: RssSourceOptions` + 类型再导出                                                                                                                                                                                                                           |
| `src/prism/config/defaults.ts`       | `DEFAULT_CONFIG.rss`（123 / 30 / 100 / grouped）                                                                                                                                                                                                                      |
| `src/prism/config/validate.ts`       | `ROOT_FIELDS` 加 `'rss'`；新增 `RSS_FIELDS` 白名单、feeds 数组校验（非空 URL、可解析、去重）、数值区间（`maxItemsPerFeed` 上限放到 ≥100）、`viewMode` 枚举                                                                                                            |
| `src/prism/source-types.ts`          | `AnySource` 增加 `Source<RssFeed[], 'rss'>`                                                                                                                                                                                                                           |
| `src/prism/app/source-registry.ts`   | `sources.push(createRssSource(config.rss, runtime))`                                                                                                                                                                                                                  |
| `src/prism/codec.ts`                 | `CODECS.rss` 条目（D8）                                                                                                                                                                                                                                               |
| `src/prism/export-import.ts`         | 抽 `downloadText(runtime, text, filename, mime)` 与 `readTextFile(file)`；`downloadJson` / `readImportFile` 改为复用二者（行为不变）。⚠️ `downloadText` 必须保留 `runtime` 参数——内部 `createElement('a')` / `body.appendChild` 走 `runtime.document`（评审 R7 确认） |
| `src/prism/save-filter.ts`           | 🆕 `SOURCE_LABELS`（`:45-56`）加 `rss: 'RSS 阅读'`（评审 R8）。该表给存储检查器的 `cache` / `state` 键生成人类可读标签，缺项会退化成显示原始 sourceId                                                                                                                 |
| `src/prism/index.css`                | `@import './overlay/rss.css';`                                                                                                                                                                                                                                        |
| `test/prism/config-validate.test.ts` | 补 rss section 用例                                                                                                                                                                                                                                                   |
| `test/prism/codec.test.ts`           | 补 rss 压缩/解压 roundtrip                                                                                                                                                                                                                                            |
| `test/prism/export-import.test.ts`   | 补 `downloadText` / `readTextFile` 用例                                                                                                                                                                                                                               |

依赖方向遵守 AGENTS.md：`rss/` 只依赖 `../shared`、`../config`、`../types`、`../editor-helpers`、`../export-import`，不 import 任何其它 feature 目录。

---

## 6. 分阶段实施

推进方式沿用既有约定：每阶段实施完停下汇报，你说 `commit` 我再提交。

### R1 · 解析层共用化（无新功能，行为不变）

1. 新建 `src/prism/shared/feed-parser.ts`：`parseFeed`（RSS/Atom/RDF 探测）、`normalizeLink`、`extractTitle`、`stripHtmlToText`、`sanitizeFeedHtml`、`parsePubDateMs`（RFC 822 / ISO 8601 / Atom 变体）。
2. `src/prism/tnews/parser.ts` 改为调用 shared：**在调 shared 之后**自行 `.filter(it => it.pubDate > 0)` 以保留「丢弃无日期条目」的现有行为（D3 / 评审 R2）；全部导出签名不变，`extractTitle` 经 `tnews/index.ts:13` 继续再导出。
3. `test/prism/tnews/*` 与 `test/prism/shared/*` 全绿，新增 `test/prism/shared/feed-parser.test.ts`。

验收：`bun run check` 通过，tnews 测试数量不减。

### R2 · 配置 + 编辑器 + OPML（先能加源、能搬家）

1. **R2.1 配置**：`rss/types.ts`、`rss/constants.ts`；`Config.rss` 三段式（types / defaults / validate）+ `config-validate` 用例。
2. **R2.2 编辑器**：源列表增删、URL 校验与去重、自定义标题、启停、高级字段（TTL / 保留天数 / 每源条数）、视图选择；保存走 `saveConfigSection` + `saveSourceSettings`，成功后 `ctx.refresh?.()` 再 `ctx.close()`。
3. **R2.3 OPML**：`export-import.ts` 抽 `downloadText` / `readTextFile`；`rss/opml.ts` 的 `buildOpml` / `parseOpml`；编辑器加导出/导入按钮与结果回显。
4. **R2.4 注册（🚨 评审 R4/R5，方式已改）**：
   - `source-registry.ts:33` 的 `sources` **数组字面量**内加 `createRssSource(config.rss, runtime)`——**不做条件 push**（空 feeds 也要注册，靠空态引导添加，与 novels 一致）；
   - `source-types.ts` 的 `AnySource` 加 `Source<RssFeed[], 'rss'>`；
   - `codec.ts` 加 `rss` 条目（D8）；
   - `save-filter.ts` 的 `SOURCE_LABELS` 加 `rss: 'RSS 阅读'`（评审 R8）。

验收：编辑器可增删源、可导出 OPML 再导入回来；`bun run typecheck` 通过；存储检查器里 rss 缓存/状态键显示为中文标签而非 `rss`。

### R3 · 数据层

1. `fetcher.ts`：`mapLimit` 并发 4，单源失败落 `error` 并保留 prev items，全失败 throw；摘要按 D9 转纯文本并截断。
2. `merge.ts`：`mergeFeedItems`（按 id 去重、pubDate 取大）、`filterByRetention`（30 天）、`sortByPubDateDesc`、`capItems`（100 条/源）——均为纯函数。
3. `state.ts`：`createRssState` + 未读计数 `unreadCount(feed, state)`。
4. `source.tsx`：⚠️ 按 `Source` 接口真实签名实现（评审 R3，已核对 `types.ts:129-131`）：

   ```ts
   async fetch(runtime: Runtime, prevData?: RssFeed[]): Promise<RssFeed[]>   // 第一个参数是 runtime
   async loadState?(runtime: Runtime): Promise<void>
   createEditor?: (settings: SourceSettings) => SourceEditor                  // 工厂模式，不是 renderEditor(ctx)
   ```

   `fetch` 内部顺序：`loadFreshOptions` → `fetchRssFeeds` → merge → `state.saveToStorage`；`loadState` 预载已读态；`getTabLabel` 返回未读徽标。
   🚨 编辑器模式用 **`createEditor(settings) => SourceEditor`**（评审 R9，见 `types.ts:131`），与 `novels/source.tsx:57-69` 一致；**不要**写成 `renderEditor(ctx)` 形态。

验收：`fetcher/merge/state` 单测通过（用 `test/runtime.ts` 的 `createRuntime` + `XmlDOMParser`，禁止真实网络）。

### R4 · 渲染层（分组视图 + 样式）

1. `component.tsx`：分组视图 = `FeedBlock` + `ExpandableList`，折叠阈值 3，折叠按钮复用 novels `ChapterList` 的写法；空态 `gm-sp-empty`「尚未添加订阅源，请通过 ⚙ 添加或导入 OPML」（⚠️ 评审 R14：空态**不提**「仅部分站点可用」——用户能看到仪表盘，说明已经在已 match 站点上了，提示反而制造困惑）。
2. `overlay/rss.css`：只用 `tokens.css` 变量，按钮/输入复用 `gm-sp-btn` / `gm-sp-input` / `gm-sp-error-box`，feature class 前缀 `gm-sp-rss-*`；`index.css` 加 import。
3. 展开区：纯文本摘要 + 「打开原文」链接（`escapeUrl` + `target="_blank"`），无 `dangerouslySetInnerHTML`。

验收：`component.test.tsx` 覆盖空态 / 未读徽标 / 折叠展开 / 点击置已读 / 单源错误展示。

### R5 · 时间线视图 + 体积复核 + 收尾

1. `component.tsx` 加时间线视图（单 `ExpandableList` + `renderExtra` 源名标签）与顶部切换按钮，视图选择持久化。
2. 时间线用 `createItemHandlers`，分组用 `createGroupedItemHandlers`（group = feedId）。
3. **缓存体积实测**（必须做，非可选项）：构造 20 源 × 100 条，测 `JSON.stringify(compressForStorage('rss', cached)).length`。> 1.5MB 则启用二级裁剪（仅最近 30 条保留摘要，更早的 `summaryText: ''` 并在展开区提示「摘要已裁剪」）；≤ 1.5MB 则维持现状并在计划里记下实测值。
4. 补 `editor.test.tsx`（含 OPML 导入导出）、`codec.test.ts`、config-validate、`export-import` 用例。
5. `bun run check`，报告 Build hash。

---

## 7. 测试计划

| 层                             | 用例                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `shared/feed-parser`           | RSS 2.0 / Atom / RDF 各一份 fixture；CDATA 描述；`<script>`/`onclick` 被 sanitize 掉；缺 pubDate；非法 XML 返回空而非抛错 |
| `rss/fetcher`                  | 保序、并发上限、单源失败隔离（其它源仍有数据）、全失败 throw、请求头含 UA/Accept、摘要截断到 300 字符                     |
| `rss/merge`                    | 按 id 去重、pubDate 取大、30 天保留裁剪、100 条/源上限、倒序                                                              |
| `rss/state`                    | markRead/isRead、隐藏、TTL 过期（fake clock）、批量已读边界                                                               |
| `rss/opml`                     | build → parse roundtrip 等价；嵌套分类目录展平；title 含 `&` `"` `<` 的转义；非法 XML 返回空；按 URL 去重                 |
| `rss/component`                | 两种视图渲染、未读徽标、折叠、点击置已读、错误态                                                                          |
| `rss/editor`                   | 增/删/改源、非法 URL 报错、重复 URL 报错、导出 OPML 内容正确、导入后合并与回显、保存落盘并触发 refresh                    |
| config / codec / export-import | rss section 校验（字段白名单、数值区间、viewMode 枚举）、压缩解压 roundtrip、`downloadText`/`readTextFile`                |

统一要求：不访问真实网络；DOM 用 jsdom/happy-dom；runtime 用 `test/runtime.ts`。

---

## 8. 风险与开放问题

**风险**

1. **R1 触碰 tnews**：会在正常工作的源上动刀。缓解：只做「搬家 + 薄适配」，tnews 的 `parseRssItems(xml, domParser)` **签名与入参个数不变**（它本来就没有 `requirePubDate` 参数，见 D3 修正），「丢弃无 pubDate 条目」的行为由 tnews 适配层自行 `.filter` 保留；测试全绿才算完成。
2. **缓存体积（因 30 天 × 100 条而放大）**：粗估单条 ~700B（含 300 字符摘要），20 源 × 100 条 ≈ 1.4MB 进 `GM.setValue`。缓解：D9 纯文本截断 + D8 字段缩写 + R5 实测门槛 1.5MB + 二级裁剪预案。Tampermonkey 无硬性小配额，但过大值会拖慢读写，故设硬门槛。
3. **item id 不稳定**：部分 feed 的 `guid` 随机或缺失，已读态会漂移。缓解：优先 `normalizeLink(link)`，`guid` 仅作兜底。
4. **订阅源反爬**：少数站点拒绝无 Referer 请求。v1 不给 Referer（`anonymous: false`，与 tnews 一致），出现问题时按源单独处理。
5. **OPML 方言差异**：各家导出的 OPML 在 `<outline>` 属性（`xmlUrl` vs `htmlUrl`、大小写、自闭合）上不统一，且可能带 BOM / 非 UTF-8。缓解：`parseOpml` 用 `getAttribute('xmlUrl')` 大小写不敏感兜底，读取前去除 BOM，编码异常时报错提示而非静默空列表。

**开放问题（本轮已关闭）**

- **O1 `@match`** —— 已定：**不动**。prism 继续只在 v2ex / github / reddit / hupu / xueqiu 注入，RSS 在这些站点可用。
  - ⚠️ **连带后果（评审 R14 的延伸，需知悉）**：不扩大 `@match` 不只影响「能不能看到卡片」，`app/index.ts` 的**后台刷新**（`requestIdleCallback` 机会性刷新 + 300s±60s 抖动定时刷新）同样只在 match 站点运行。也就是说：只有你打开这些站点时 feed 才会被抓取，其它站点的停留时间不产生刷新。这是「不动 @match」的真实代价，接受。
- **O2 默认参数** —— 已定：`ttlMinutes = 123`、`retentionDays = 30`、`maxItemsPerFeed = 100`（`validate.ts` 的区间上限需相应放宽）。
- **O3 OPML** —— 已定：**纳入 v1**，落在 R2.3。

**待你确认的新增项**

- **D9 摘要纯文本**：这是为适配「100 条/源」新加的决策，代价是摘要里看不到图片和内嵌链接。若你希望保留富文本摘要，请驳回，我改回 sanitize 后的 HTML 并建议把 `maxItemsPerFeed` 降到 20–30。无异议则按纯文本执行。（评审 R10 已认可本条，最终仍以你为准。）

---

## 9. 评审处置台账（`rss-reader.plan.review.md` 第一轮）

判定口径：**先核实、后判定**；每条都给出 `file:line` 依据，便于日后复核。共 14 条：接受 9、接受并修正 4、驳回 1。

| ID   | 级别                         | 判定                               | 核对依据                                                                                                                                                         | 处置                                                                                                                                                                                           |
| ---- | ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C.1  | 🔴 codec shape               | 接受并修正                         | `codec.ts:386-389` `case 'array': return data.map(v => fn(v))` —— 只逐顶层元素调用，不递归 `items`                                                               | D2 补写「`compressRssFeed` 内部必须 `items.map(compressRssItem)`」；D8 同步。计划原意（D8 的 `it:[...]`）本就含嵌套，但「直接复用」措辞误导，已改                                              |
| C.2  | 🔴 `requirePubDate`          | 接受并修正                         | `tnews/parser.ts:20` `parseItem(item, domParser)` 只有两参；`:30` 硬编码 `if (!pubDate) return null`；`:52` `parseRssItems(xml, domParser)` 同样两参             | D3 改为「shared 默认保留无日期条目，tnews 适配层调用后再 `.filter(it => it.pubDate > 0)`」；R1 步骤 2 同步                                                                                     |
| C.3  | 🔴 `fetch` 签名              | 驳回（对当前文档不成立）+ 采纳建议 | 复核计划全文 `grep -n "fetch("` **无匹配**，当前文档未出现 `fetch(prev)` 的描述；真实签名 `types.ts:129` `fetch(runtime: Runtime, prevData?: T)`                 | 判定「计划把 fetch 描述为 fetch(prev)」不成立（评审可能据早期草稿或 `fetchRssFeeds(runtime, configs, prevFeeds)` 的参数顺序推断）。但采纳其建议：R3 步骤 4 显式写出 `fetch` / `loadState` 签名 |
| C.4  | 🔴 registry 写法             | 接受并修正                         | `source-registry.ts:33` 数组字面量；`:44` xit 条件 push；`:46` `sources.push(createMiscSource(runtime))` —— **两种写法并存**                                     | 评审「而非先建数组再 push」只对一半（misc 就是 push）。已定为「无条件进字面量」，理由（空态引导，同 novels）写入 D1；R2.4 同步                                                                 |
| C.5  | 🔴 `order` 冲突              | 接受（且比评审更强）               | `card-group.ts:39-41` 按 `priority ?? order` 组内排序；`browse` 组：v2ex=0 / tnews=1 / novels=2 / **reddit=3** / hupu=4 / xueqiu-news=4 / xueqiu-hot=5 / misc=10 | 冲突发生在**同一 group 内**（不只是全局重号）。`order` 改为 **6**；D1 补完整占用表与依据行号                                                                                                   |
| C.6  | 🟡 `mapLimit` fail-fast      | 接受                               | `concurrency.ts:43` 任一 mapper reject 即 `settled = true; reject(err)`，语义等同 `Promise.all`                                                                  | D5 补两条硬约束：`fetchOne` 内部 catch 永不 reject；外层「全部 error 才 throw」；照 `novels/fetcher.ts:135-155` 写法                                                                           |
| C.7  | 🟡 `downloadText` 的 runtime | 确认无问题                         | `export-import.ts:34-45` 用 `runtime.document.createElement` / `body.appendChild`                                                                                | 无代码改动；在 §5 修改表补注「必须保留 runtime 参数」                                                                                                                                          |
| C.8  | 🟡 `SOURCE_LABELS`           | 接受                               | `save-filter.ts:45-56`（含 v2ex/reddit/hupu/tnews/xueqiu/weather/novels/misc，缺 rss）；`:75`/`:81` 用于 state/cache 键标签                                      | §5 修改表 + R2.4 增加 `rss: 'RSS 阅读'`；R2 验收加一条                                                                                                                                         |
| C.9  | 🟡 编辑器模式                | 接受                               | `types.ts:131` `createEditor?: (settings: SourceSettings) => SourceEditor`；`novels/source.tsx:57-69` 同模式                                                     | R3 步骤 4 明确用 `createEditor` 工厂，禁用 `renderEditor(ctx)` 形态                                                                                                                            |
| C.10 | 🟡 D9 纯文本                 | 接受（认可）                       | 体积约束 + AGENTS.md「Preact 树内禁 `dangerouslySetInnerHTML`」                                                                                                  | D9 加注评审认可与升级路径（token 化，非回到 `dangerouslySetInnerHTML`），v1 不实现                                                                                                             |
| C.11 | 🟢 `extractTitle` private    | 驳回                               | `tnews/parser.ts:62` `export function extractTitle(` **已导出**；`tnews/index.ts:13` 再导出；`test/prism/sources/tnews/parser.test.ts:93` 直接 import 单测       | 「未导出」的事实判断不成立。采纳其精神：shared 中保持导出（供测试与 tnews 复用），rss 侧不直接调用，只由 `parseFeed` 内部使用                                                                  |
| C.12 | 🟢 `isShortFeed` 命名        | 接受                               | `codec.ts:44` `isShortItem(v) = typeof v.t === 'string'`；压缩后 feed 的 `title` → `t`，未压缩时无 `t`                                                           | D8 改为复用 `isShortItem`，删除 `isShortFeed`，避免两套嗅探逻辑漂移                                                                                                                            |
| C.13 | 🟢 测试目录重复              | 接受                               | 计划同时列了 `test/prism/rss/feed-parser.test.ts` 与 `test/prism/shared/feed-parser.test.ts`                                                                     | §5 删除 rss 下那份，shared 解析器只在 `test/prism/shared/feed-parser.test.ts` 测                                                                                                               |
| C.14 | 🟢 `@match` 空态提示         | 接受并修正                         | `app/index.ts` 的 `requestIdleCallback` 机会性刷新与 300s±60s 抖动刷新均在脚本内运行，脚本只在 match 站点注入                                                    | R4 空态**不提**站点限制（评审自己的第二条判断正确）；但把「后台刷新同样只在 match 站点发生」写进 §8 O1，作为已知代价                                                                           |

**尚未关闭 / 需后续验证**

1. **D9 仍需你最终点头**（评审已认可，但你是决策人）。
2. **R5 缓存体积实测**未做——1.4MB 是估算，实测 > 1.5MB 才启用二级裁剪，结论以实测为准。
3. **`order: 6` 的观感**未验证：只在真实浏览器里看过排序才知道 6 是否合意（排在雪球之后、杂项之前）。可事后用 `sourceSettings.rss.priority` 调，无需改代码。
