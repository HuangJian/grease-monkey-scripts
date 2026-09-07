# 前端架构评审与重构方案

> 范围：`grease-monkey-scripts` 全仓（Bun + Preact 10 + TypeScript 7 + oxlint/oxfmt）
> 角色：前端架构师 · 只读评审，本文档只提出结论与方案，不含代码改动
> 方法：静态审查 + 依赖环检测（DFS 176 文件）+ oxlint/tsc 实测 + 产物取证
> 基线：`AGENTS.md` 自定的架构约定（分层、依赖方向、Runtime 收敛、DOM 安全、CSS、反模式清单）

---

## 0. 总体结论

这个仓库的**代码质量显著高于普通油猴脚本项目**：类型系统几乎无 `any`（审查范围内零 `any`/`as never`/`@ts-ignore`），`Runtime` 抽象收敛度高（`window`/`location`/`GM_*`/`unsafeWindow` 在 `src/prism` 下零裸调），测试规模（85 个测试文件 / 1.97 万行）接近源码规模（2.14 万行），构建链（SWC + Lightning CSS + hash 增量）设计合理。

但存在**三类必须优先处理的问题**：

1. **P0 安全**：`xueqiu` 自研黑名单 sanitizer 同时踩了 XSS 面 + ReDoS 两个坑，且是全仓唯一一处用正则"净化"后塞 `dangerouslySetInnerHTML` 的路径。
2. **P1 正确性**：配置加载不校验、存储键命名空间 4 套漂移、`source-registry` 用 11 处双重断言抹掉泛型、预览入口 7 处 `undefined as any`、codec 无版本迁移。
3. **P2/P3 架构**：7 个真实导入环但 lint 无门禁、Runtime 未收敛定时器与时钟、`novels` 翻页无上限 + 合并 O(n²) 两处性能悬崖、抓取层 7 份复制粘贴。

这些问题大多不是"坏代码"，而是**约定没有被工具强制**的结果——环依赖、跨层 import、模块级状态、类型逃逸全都绕过了 reviewer 的眼睛，靠的是人力自觉。

---

## 1. P0 — 安全

### 1.1 `xueqiu` 自研黑名单 sanitizer：先解码实体再过滤 + ReDoS

**位置**：`src/prism/xueqiu/component.tsx:15-36`，调用点 `:373`、`:382`

```ts
// component.tsx:28-35
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // ← ReDoS
    .replace(/javascript:/gi, '')                                       // ← 删除而非拦截
    .replace(/on\w+\s*=/gi, 'data-blocked=')
}
// component.tsx:373
dangerouslySetInnerHTML={{ __html: sanitizeHtml(unescapeHtml(item.text)) }}
```

**问题**（三个叠加）：

1. `unescapeHtml`（`:15-26`）主动把 API 返回的实体还原成**活标签**，再交给黑名单。黑名单漏 `&#106;avascript:`（浏览器解析 href 属性时先解码实体，字符串替换抓不到）、`data:text/html`、`srcdoc`、`<base>`、`<form>`。
2. `.replace(/javascript:/gi,'')` 是**删除**不是拦截，语义错误。
3. `:30` 的 `<script>` 匹配是 tempered-greedy-token 嵌套量词，输入含 `<script` 但无 `</script>` 时回溯随 `<` 数量指数增长——雪球任意长度的用户正文即可冻结主线程。这是纯净函数，构造 40 个 `<` 即可在单测中复现。

**影响**：雪球用户可控的 `title`/`text` 字段注入 Shadow DOM 内 `innerHTML`（主列表 + lightbox `:425`）。当前受 Shadow DOM 保护削弱，但属于脆弱的纵深防御。

**方案**：

- 把 `tnews/parser.ts:130-206` 已有的 **DOM 白名单 sanitizer**（`ALLOWED_TAGS` / `sanitizeAttrs` / 危险 href 前缀校验）抽到 `src/prism/shared/sanitize.ts`。
- `xueqiu/component.tsx` 改为 `sanitizeHtml(item.text)`——**不要再 `unescapeHtml`**，DOM 解析器天然处理实体。
- 删除 `xueqiu/component.tsx:15-40` 三个本地函数。

**优先级**：最高。安全 + 性能双重，且修法是"复用已有正确实现"，成本低。

### 1.2 JSX 子节点 `escapeHtml` → 双重转义（用户可见显示 bug）

**位置**：`novels/component.tsx:242,251,276,279,300,307,308,53,152`、`v2ex/component.tsx:105,106`、`reddit/component.tsx:95,105`、`hupu/component.tsx:95,105`、`weather/editor.tsx:159`、`novels/editor/form.tsx:264,269`、`xit/component/header.tsx:210,258`

**问题**：JSX 文本子节点由 Preact 自动转义，预先 `escapeHtml` 导致二次编码——标题里的 `&` 显示成 `&amp;`。同一文件内两种写法混用（`v2ex/component.tsx:102` 的 `dangerouslySetInnerHTML={{__html: escapeHtml(x)+suffix}}` 是**正确**用法，隔壁 `:105` 的 `{escapeHtml(x)}` 是**错**的），说明约定不清。

**影响**：中英混排标题（Reddit/V2EX 极常见 `&`）渲染出 `&amp;`。未被测试覆盖。

**方案**：删除 JSX 文本子节点/属性位的 `escapeHtml` 调用；只保留 `dangerouslySetInnerHTML` 场景的手工转义。建议把 `escapeHtml` 重命名为 `escapeHtmlForRawHtml` 消除歧义。

---

## 2. P1 — 正确性

### 2.1 `loadConfig` 完全不校验，损坏配置零告警进入运行时

**位置**：`src/prism/config/load.ts:6-10`

```ts
export async function loadConfig(runtime: Runtime): Promise<typeof DEFAULT_CONFIG> {
  const userOverride = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (!userOverride) return DEFAULT_CONFIG
  return deepMerge(DEFAULT_CONFIG, userOverride) // ← 无 validateConfig
}
```

`validateConfig` 的 9 处调用全在**编辑器保存路径**和**导入路径**，加载路径没有。GM 存储里一份损坏/手改过的配置会直接经 `deepMerge` 的 `as T` 变成 `Config` 进入运行时，零告警。

**方案**：`load.ts:9` 改为先 merge 再 `validateConfig(merged)`，`!v.ok` 时 `console.warn` 并回落 `DEFAULT_CONFIG`；返回类型从 `typeof DEFAULT_CONFIG` 收紧为 `Config`。

### 2.2 存储键命名空间至少 4 套重复定义，改一处静默漂移

**位置**：

- `types.ts:4` 与 `save-filter.ts:24` **各自定义** `KEY_PREFIX = 'dashboard:v2'`，未互相 import。
- `types.ts:6-8` 提供 `CACHE_KEY()/STATE_KEY()/LOCK_KEY()`，`save-filter.ts:25-27` 另建 `CACHE_KEY_PREFIX/...`，且 `:105-107` 硬编码 `'dashboard:v2:xueqiu-news'`。
- `export-import.ts:9` `XIT_CACHE_KEY = 'xit'` 是裸 sourceId 不带前缀，命名误导；`:24,71,85,128` 四次硬编码 `'dashboard:v2:xit'`。
- 4 套命名空间混用：`dashboard:v2:*` / `gm:misc:openrouter:cache`（`misc/source.tsx:8`）/ `gm:xueqiu:ai-summaries`（`xueqiu/ai/summarize.ts:5`）/ `reddit_author_tags` vs `gm:reddit:author-tags`（`shared/author-labels.ts:6-12`）。

**方案**：新建 `src/prism/keys.ts` 作为唯一键定义叶子（`KEY_PREFIX`、`CACHE_KEY()`、`STATE_KEY()`、`LOCK_KEY()`、`CONFIG_KEY`、各 `gm:*` 系列），`types.ts:4-9`、`save-filter.ts:24-27,105-107`、`export-import.ts:9-10,24,71,85,128`、`xit/recurring-reset.ts:5` 全部改为从 keys.ts 导入。

### 2.3 `validate.ts` 白名单式校验：未知键静默通过 + 漏字段

**位置**：`src/prism/config/validate.ts`（13 个 section 全部 `if ('x' in value)` 守卫）

**问题**：

- 拼错的键既不报错也不被默认值覆盖：`{v2ex:{ttlMinuts:5}}` 校验通过，`deepMerge` 把它塞进 Config，实际 ttl 静默保持 30。
- 类型与校验是两套独立事实来源，漏字段：`weather/types.ts:5` 的 `cmaStationId` 未校验（`validate.ts:74-82` 只查 latitude/longitude/cityLabel）；`novels` 只校验 `title`+`urls`（`:148-169`），`NovelBookConfig` 的 `id/sources/latestChapters/lastSeenChapterKey/error` 全未校验。
- `validate.ts:3` `VALID_BADGE_TYPES` 手写数组，与 `types.ts:117` `BadgeType` 联合类型重复。

**方案**（不引入 zod，符合"最小改动"）：`VALID_BADGE_TYPES` 声明为 `as const` 数组再 `type BadgeType = typeof ...[number]` 派生；每个 section 的字段名抽成 `const V2EX_FIELDS = [...] as const`，同时驱动 `keyof Config['v2ex']` 编译期检查和 excess-key 运行时检查；补 `cmaStationId` 与 novels 剩余字段。

### 2.4 codec 无版本迁移，靠字段形状嗅探

**位置**：`src/prism/codec.ts`、`cache.ts:16`

**问题**：

- `types.ts:15` `CACHE_SCHEMA_VERSION = 2`；`cache.ts:16` `if (value.schemaVersion !== CACHE_SCHEMA_VERSION) return null` 是**丢弃**（重新拉取），不是迁移。
- legacy 判定全是启发式：`codec.ts:66,94,122,158,185` 一律 `if (v.title !== undefined) return v`；`:270` `if (b.lc !== undefined || b.u !== undefined)`；`:289` `const legacy = b.u !== undefined`。
- 时间戳单位靠阈值猜：`codec.ts:23-27` `if (v < 1e9) return v * 60000`。当前边界安全，但 schemaVersion 升到 3 且字段形状与 v2 重叠时，这些 `if (x !== undefined)` 会互相误判，且无编译期信号。

**方案**：`CachedSource<T>` 增加可选 `codecVersion`，`CODECS` 每个 entry 带 `version`，按 `sourceId + version` 精确分派；新增 `src/prism/codec-migrate.ts`，`cache.ts:16` 改为 `migrate(value)`，无法迁移才丢弃并 `console.warn`；`1e9` 常量提为具名常量。

### 2.5 `deepMerge` 签名不健全：`unknown` 直接断言成 `T`

**位置**：`src/prism/config/merge.ts:20-35`

`deepMerge<T>(base: T, override: unknown): T`，靠 `:8-19` 共 8 行注释论证 `as T` 安全，但 `:30` `else if (overrideVal !== undefined) result[key] = overrideVal` —— base 是 `number`、override 是 `string` 时，string 被直接写入并宣称是 `T`，注释对**类型不匹配**零保护。

**方案**：签名收紧为 `deepMerge<T extends Record<string, unknown>>(base: T, override: unknown): T`，`:30` 分支加 `typeof baseVal !== typeof overrideVal && baseVal !== undefined` 时 `console.warn` 并跳过；或返回 `DeepPartial<T> & T`。

### 2.6 `source-registry` 11 处 `as unknown as Source<unknown>` 抹掉泛型

**位置**：`src/prism/app/source-registry.ts:20-32`

```ts
createV2exSource(config.v2ex) as unknown as Source<unknown>,   // :20
createWeatherSource(config.weather) as unknown as Source<unknown>,
createNovelsSource(config.novels, runtime) as unknown as ...,
// ... 共 11 处
```

双重断言彻底抹掉 `Source<T>` 的泛型参数，`Source<V2exTopic[]>` / `Source<XitData>` 全塌成 `Source<unknown>`，`fetch()` 返回类型与 `RenderComponent` 的 `data` prop 全失去检查。AGENTS.md:281 禁止 `Source<any>`，这是同一家族、同等危险，只是换了写法绕过 reviewer 眼睛。**下游已可见后果**：`card/card.tsx:46` `as T | null`、`card/tabs-card.tsx:37` `as unknown`——因为上游丢了类型，渲染层只能再补断言。

**方案**：定义判别联合 `type AnySource = Source<V2exTopic[]> | Source<WeatherData> | Source<NovelData> | ...`，`sources: AnySource[]`，消费处用 `source.id` 收窄。最小退路：至少降为单次断言 `as Source<unknown>`，并在注册点加 `assertSourceDataShape<T>()` 编译期断言。

### 2.7 预览入口 7 处 `undefined as any`

**位置**：`xit/render/index.tsx:23-24`、`v2ex/render.tsx:19`、`hupu/render.tsx:23`、`reddit/render.tsx:23`、`tnews/render.tsx:18`、`weather/render.tsx:10-11`、`novels/render.tsx:20`——清一色 `root={undefined as any} runtime={undefined as any}`。

任何 preview 子树访问 `runtime.getValue()` 或 `root.querySelector()` 都运行时 TypeError，而编译器一声不吭。

**方案**：让 preview 入口接受真实 `Runtime` 参数；若确实不需要，把 `SourceComponentProps` 的 `root`/`runtime` 改为可选，新增 `PreviewProps<T> = Omit<..., 'root'|'runtime'>`。

### 2.8 `xueqiu` hotSource 的 `fetch` 是空实现，绕过 fetch→cache→render 数据流

**位置**：`src/prism/xueqiu/source.tsx:168-177`

```ts
async fetch(runtime) {
  return { news: [], hotPosts: [] }   // 真实数据在 RenderComponent 里 loadCache(MAIN_SOURCE_ID) 自取
}
```

**影响**：`refreshSource`（`app/refresh.ts:26-27`）用 `[]` 覆盖 hotSource 缓存并把 `fetchedAt` 刷成 now → 该 tab 永远"刚刷新过"却是空数据；错误语义不一致（main 用 `SkipRefreshError` 不写缓存不占锁，hot 用 `new Error(...)` 会写 error + 触发退避）。

**方案**：把取数逻辑搬进 `fetch`（从 `MAIN_SOURCE_ID` 读 → `rankHotPosts` → 返回），`RenderComponent` 只消费 props。

### 2.9 配置在构造期快照，编辑器改 TTL/阈值必须刷新页面才生效

**位置**：`v2ex/source.tsx:76` `ttlMs: options.ttlMinutes * 60_000`（数字快照）、`tnews/source.tsx:23`、`reddit/source.tsx:87`、`hupu/source.tsx:87`、`xueqiu/source.tsx:60`。

对照组：`weather/source.tsx:62`、`reddit/source.tsx:104`、`novels/source.tsx:37` 会 `loadFresh*` 重读；`misc/source.tsx:46-48` 用 getter 规避。而 `v2ex/editor.tsx:45-50` 已写 `loadFreshOptions` 但 `v2ex/source.tsx` 从未调用。

**方案**：统一约定——每次 `fetch` 开头 `loadConfigSection` 重读；`ttlMs` 全部改 `get ttlMs()`（照抄 `misc/source.tsx:46-48`）。

---

## 3. P2 — 性能

### 3.1 `novels` `maxLatestWindow` 完全未生效 → 尾页无上限串行抓取

**位置**：`src/prism/novels/fetcher.ts:61-67`（`_options` 未使用）、`:209-220`、`config/defaults.ts:38`（`maxLatestWindow: Infinity`）

一本 100 页的书首抓 = 99 次串行 HTTP（每次 15s 超时 → 最坏 25 分钟），且 `:219` `[...tailChapters.reverse(), ...chapters]` 逐页全量复制，5000 章量级约 12.5M 次元素拷贝。

**方案**：`fetchOneBook` 真正消费 `options.maxLatestWindow`：首页已有足够章节时直接切片不翻页；必须翻页时只取末尾 `ceil(maxLatestWindow/perPage)` 页；数组重建改为先收集再一次性 `reverse().flat()`。`defaults.ts:38` 的 `Infinity` 改有限值（如 200）。

### 3.2 `novels` 跨源合并 O(n²)

**位置**：`src/prism/novels/merge.ts:138-152`（两处 `nodes.findIndex` 全量扫描）、`:89-98`（textKey 分桶内两两 union，桶大小 k 时 O(k²)）、`:10-12`+`chapter-key.ts:85-90`（纯 `"第1章"` 标题归一化后 textKey 为 `''`，聚成大桶）。

**方案**：`toNodes` 时建 `Map<sourceIndex, Map<variant, nodeIdx>>` 替换两处 `findIndex`；textKey 为空串时跳过 text-bridging（`merge.ts:83-88` 加 `if (!n.textKey) continue`）。

### 3.3 全局无并发控制，冷启动 30+ 并发请求

**位置**：`app/refresh.ts:89` `await Promise.all(stale.map(...))`；`reddit/fetcher.ts:117`、`hupu/fetcher.ts:63`、`novels/fetcher.ts:35 × :83`、`weather/api.ts:263 × :136-140` 内部再并发。

**方案**：`src/prism/shared/concurrency.ts` 提供 `mapLimit(items, 4, fn)`，`app/refresh.ts`、`novels/fetcher.ts`、`hupu/fetcher.ts` 接入。

### 3.4 SafeLine PoW 在主线程同步暴力破解

**位置**：`src/prism/weather/cma/safeline.ts:182`（`MAX_POW_ITERATIONS = 1_000_000`）、`:191-199`（`while` 循环内同步 `sha1Hex`）。

难度上调即主线程冻结（20 bit ≈ 1M 次 SHA-1）；`:200-208` 超限后返回 `'0'`，仍会发一次注定失败的重试请求。

**方案**：失败时直接 `throw`，走 `fetchCmaCity` 的 `Promise.allSettled` 降级分支；难度 > 阈值直接放弃；长期把 `sha1Hex` 换成 `crypto.subtle.digest`。

### 3.5 `hupu` 惰性量词正则 + `tnews` 正则二次处理

- `hupu/fetcher.ts:35` `/window\.\$\$data\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/` 在 ~1MB HTML 上逐 `}` 试探。→ 先 `indexOf('window.$$data')` 定位再 `indexOf('</script>')` 切段 `JSON.parse`。
- `tnews/component.tsx:22-24` `stripImgSizeAttrs` 用正则处理已被 `tnews/parser.ts:193-196` 净化过的 HTML。→ 删除，用 CSS `.gm-sp-tnews img { width:auto }`。

---

## 4. P3 — 架构与可维护性

### 4.1 7 个真实导入环，且 lint 完全无门禁（最该先动的架构问题）

**证据**：DFS 检测 176 文件得 7 个环；`oxlint` 显式开 `import/no-cycle` 后仅 reddit+xit+hupu 三个目录即报 **12 errors**：

| 环                                                               | 值导入边                                        | 运行时成环 |
| ---------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| `reddit/source.tsx:14` ↔ `reddit/editor/form.tsx:16`             | `createRedditEditor` / `loadFreshRedditOptions` | 是         |
| `hupu/source.tsx:14` ↔ `hupu/editor/form.tsx:16`                 | `createHupuEditor` / `loadFreshHupuOptions`     | 是         |
| `xit/source.tsx:5` ↔ `xit/component/header.tsx:6`                | `XitHeaderControls` / `getTagCounts`            | 是         |
| `xit/source.tsx:6→body.tsx:5→editor.tsx:5→render/index.tsx:2→回` | 四跳                                            | 是         |
| `xit/source.tsx:7` ↔ `xit/editor.tsx:6`                          | `createXitEditor` / `DEFAULT_XIT_TEXT`          | 是         |
| `reddit/source.tsx:12` ↔ `reddit/component.tsx:12`（type-only）  | 类型擦除                                        | 否         |
| `hupu/source.tsx:12` ↔ `hupu/component.tsx:12`（type-only）      | 类型擦除                                        | 否         |

当前**没爆炸**是因为环上引用都在 render/回调里才读取，无模块顶层求值——脆弱平衡，谁在顶层加一行 `const X = loadFreshRedditOptions()` 就拿到 `undefined`。

**根因**：`.oxlintrc.json:5-8` 只开了 `correctness`/`suspicious` 两个 category，`import/no-cycle` 不在其中。

**方案**（两步）：

1. `.oxlintrc.json` 加 `"import/no-cycle": "error"`（1 行，立即暴露全部环）。
2. 把环上的共享符号下沉为叶子模块：`reddit/options.ts`、`hupu/options.ts`（`loadFresh*Options` 移出 source）；`xit/tag-counts.ts`（`getTagCounts`）、`xit/constants.ts`（`DEFAULT_XIT_TEXT`）；`createXitEditor` 改由 props 注入切断 `body.tsx:5`。

### 4.2 Runtime 未收敛定时器与时钟

**位置**：`src/runtime.ts:26-54`（`Runtime` 无 `setTimeout/setInterval/now`）。

- 8 处裸定时器：`card/primitives.tsx:41`、`app/index.ts:44,142`、`lock.ts:52`、`xueqiu/fetcher.ts:66,100`、`xueqiu/component.tsx:210`、`reddit/fetcher.ts:57`。
- 28 个文件 / 60+ 处裸 `Date.now()`。反例证明可行：`lock.ts:14,31-32` 已做 `now?: () => number` 注入，是全仓唯一做过时间注入的模块。

**影响**：测试必须 monkey-patch 全局——`test/prism/scheduling.test.ts:23-30` 直接替换 `globalThis.setTimeout/...`，既污染全局（并行测试不安全），也证明"Runtime 是唯一宿主边界"约定已破。

**方案**：`Runtime` 增加 `setTimeout/clearTimeout/setInterval/clearInterval/now()`；`test/runtime.ts` 提供 fake clock；替换 8 处裸调用并删掉全局 patch。

### 4.3 `types.ts` 不是叶子节点

**位置**：`types.ts:35-39` import 5 个 feature 的 types。AGENTS.md:219 要求"Types and constants have no internal imports"。使 `Config` 无法在不拉入 feature 的情况下被引用。

**方案**：`Config` 的外部字段在各自 feature 目录定义后由 `config/types.ts` 组装；或把 5 个纯配置类型（`WeatherCity` 等）上移到 `src/prism/config/types.ts`。

### 4.4 feature 反向依赖 shell/ 与 card/

- `xit/component/body.tsx:4` → `import { showEditorDialog } from '../../shell/editor'`（feature 直接调外壳层）。
- feature → `card/`：`xueqiu/source.tsx:15`、`xit/component/header.tsx:18`、`v2ex/component.tsx:5`、`reddit/component.tsx:5` 等。
- `card/card.tsx:5`、`card/tabs-card.tsx:7` → `import { createEditHandler } from '../shell/editor'`（横向）。

**方案**：`createEditHandler` 抽到 `card/edit-handler.ts`；`card/icons.tsx` 移到 `shared/icons.tsx`；`showEditorDialog` 改为经 `SourceComponentProps` 的 `onEdit` 回调注入。

### 4.5 模块级可变状态 2 处（违反 AGENTS.md:279）

1. `shell/mount.tsx:29` `const roots = new WeakMap<HTMLElement, ShadowRoot>()`——收进 `mountOverlay` 返回的 `OverlayHandle`，`getMountedRoot` 改为接受 handle。
2. `xit/filters.ts:7` `let nextId = 1`——移入 `createXxxFilters()` 工厂闭包或改用 `crypto.randomUUID()`。

### 4.6 xit 双份 header state 初始化

**位置**：`xit/source.tsx:43-50` 与 `xit/render/index.tsx:12-19` 各自构造 `createHeaderState<XitHeaderState>`，6 字段逐字相同。→ 抽 `createXitHeaderState()` 工厂共用。

### 4.7 `Source` 接口实现不齐（AGENTS.md:273 列明的反模式）

10 个 source 实例中仅 `xueqiu-main` 与 `xit` 完整。缺 `loadState` 3 个（weather/novels/misc）、缺 `RenderHeader` 3 个（novels/tnews/misc）、缺 `getTabLabel` 4 个（reddit/hupu/v2ex/weather），另有 xueqiu-hot 的 fetch 空壳（见 2.8）。

**方案**：`types.ts:143` 附件补 `SourceShape` 编译期清单；无状态 source 显式写 `loadState: undefined` 并注释原因，避免被当成遗漏。

### 4.8 抓取层 7 份重复的 request 包装 + status/超时不一致

同一段 `runtime.request` Promise 包装 7 处：`weather/http.ts:9-65`、`tnews/fetcher.ts:8-30`、`reddit/fetcher.ts:18-105`、`hupu/fetcher.ts:8-52`、`v2ex/fetcher.ts:71-99`、`xueqiu/fetcher.ts:70-91`、`misc/openrouter/fetcher.ts:24-46`、`novels/fetcher.ts:293-311`。

status 校验分裂：`>=400` 拦截只有 tnews/reddit/hupu/misc 有；v2ex/novels/weather/xueqiu 无。超时分裂 15s/20s。

**方案**：新建 `src/prism/shared/request.ts`（`requestText`/`requestJson`，统一 `status>=400 抛错 + 归一化 + 默认 15s`），8 处收敛为 1 处。

### 4.9 重试策略只有 reddit/xueqiu 有

`reddit/fetcher.ts:54-59`（429 + Retry-After）、`xueqiu/fetcher.ts:143-161` 有重试；其余 6 个 fetcher 单次失败即放弃。→ 把 429 退避下沉到 4.8 的统一 `requestText`，用 `opts.retry?: {statuses, max}` 声明式开启。

### 4.10 GBK 编码零兜底（需实测确认）

`src/prism` 下 `grep charset|TextDecoder|gbk` 零命中。`novels/fetcher.ts:293-311` 直接取 `response.responseText`，而 sudugu/deqixs 是中文小说站。若响应声明 `gb2312` 而按 UTF-8 解码 → 标题乱码 → `chapterNumber()` 提取失败 → 全部章节降级 `t:` 文本 key → 跨站合并与已读标记失效（连锁故障）。

**方案**（先实测再改）：`curl -sI` 确认 sudugu 实际 Content-Type；`runtime.request` 增加 `responseType:'arraybuffer'` 或 `overrideMimeType`，`NovelAdapter` 加 `charset?: string`。

### 4.11 其余重复实现（一并抽取）

| 重复点                                       | 位置                                                                                          | 建议落点                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| `pruneExpiredCache` 4 份拷贝（含 40 行注释） | `v2ex/source.tsx:53-71`、`reddit:55-82`、`hupu:55-82`、`xueqiu:203-233`                       | `shared/prune.ts`         |
| 相对/绝对时间解析 3 份                       | `hupu/parser.ts:111-133`、`novels/adapters/sudugu.ts:8-48`、`weather/cma/parse-page.ts:47-52` | `shared/time-parse.ts`    |
| URL 重写工具重复                             | `novels/fetcher.ts:331-343` vs `novels/mirror.ts:3-33`                                        | 合并进 `novels/mirror.ts` |

### 4.12 死代码 + 死配置（接线或删除）

- **勘误（S9.1 复核）**：`xit/source.tsx:25 getTagCounts` **非死代码**——定义在 `xit/tag-counts.ts:3`，有调用方 `xit/component/header.tsx:5,41`，存活，保留。
- **真正死代码（S9.1 已删）**：`novels/state.ts:11 isNewChapter`、`novels/state.ts:4 initialSeenKey` 全仓 0 调用，已从 `novels/state.ts` 删除；保留 `newChapters`/`newChapterCount`（有调用方）。
- **勘误（S9.1 复核）**：`initialNewChapters`（`types.ts:78`）、`maxNewChaptersPerBook`（`types.ts:79`）**非无效**——被 `config/defaults.ts`、`config/validate.ts`、`novels/editor/*`、`novels/source.tsx`、`novels/fetcher.ts` 等多处活跃使用。`novels/merge.ts:4-5` 的 `20/10` 是**展示折叠**独立阈值，与编辑器"折叠阈值"是两回事，非 bug，留作后续观察（不纳入 S9）。

### 4.13 兼容性与细节

- `xit/render/list.tsx:29` 用了 lookbehind `(?<=\s|^)`，Safari < 16.4 直接 `SyntaxError`，整个 userscript 模块解析阶段挂掉。→ 改 `(?:^|\s)` + 捕获组。
- `addValueChangeListener`（`app/index.ts:177`）返回值被丢弃，`Dashboard` 无 `destroy()`。→ 补 `destroy()` 与 `removeValueChangeListener`。
- `shared/expandable-list.tsx:151` `data-item-id={escapeHtml(id)}` 与 `:25` 查询侧 `CSS.escape(id)` 不一致。→ 去掉 escapeHtml。
- `reddit/scoring.ts:45-48` 有 `subFromUrl` 归属校验，`hupu/scoring.ts` 无 board 校验。→ 补 `boardFromUrl`。

---

## 5. P4 — 工程化

### 5.1 dist 残留 5 个孤儿脚本（src 已删，产物未清理）

`src/` 只有 7 个模块（article-preloader / prism / hanzi-dictionary / reddit-time-saver / hupu-time-saver / v2ex-time-saver / shared），但 `dist/` 有 12 个脚本。`a-dark-room-robot`、`drag-and-drop-link-opener`、`ga-rss-filter`、`geekpark-better-ui`、`lizhi-fm-web-ui` 在 src 中已不存在，产物却仍在——构建脚本只写不删，废弃脚本持续累积。

**影响**：这 5 个死产物里还残留着老源码的 `console.log`（`dist/a-dark-room-robot.user.js` 含 `console.log(html)`、`dist/lizhi-fm-web-ui.user.js` 含 2 处），而当前 src 已零 `console.log`。用户仍可能从 dist 安装死脚本。

**方案**：构建脚本在写入前清理 `dist/` 中无对应 `src/<name>/index.user.ts` 的孤儿文件；或加一个 `scripts/clean-dist.ts` 进 `check`。

### 5.2 SWC 压缩过度激进（`unsafe` + `properties` + `hoist_props`）

**位置**：`scripts/build-userscript.ts:108-134`。`SWC_OPTIONS.compress` 开了 `unsafe: true`、`properties: true`、`hoist_props: true`、`passes: 3`、`inline: 2`。

这些是激进变换（属性访问重写、不安全数学化简），对运行在**第三方页面**里的油猴脚本风险偏高——一旦与站点脚本或宿主变量名冲突，产生的 bug 极难定位（只在 minify 后出现）。注释里的 `replace void 0 with 0[0]` 这类 post-optimization 也是同类 hack。

**方案**：至少关掉 `properties`/`hoist_props`，评估 `unsafe` 的收益/风险比；`postSwcOptimize` 的字符串级 hack（`0[0]` 替换）建议移除。

### 5.3 prod `.user.js` 仍含 `console.debug`（与 AGENTS.md 剥离约定矛盾）

**位置**：`build-userscript.ts:410,430` 在 minify 后追加 `\nconsole.debug('${name}:build ${hash}')`。

`AGENTS.md:183` 约定"Build strips console.debug from `.user.js`"，但 hash 标记是 minify **之后**追加的，因此 prod 产物里 6 个脚本各含 1 条 `console.debug`。这是 hash 校验需要的标记，但实现方式与约定矛盾。

**方案**：把 hash 标记写入注释（`// build <hash>`，`readExistingHash` 已经是按注释解析的）而非 `console.debug`；或明确在 AGENTS.md 记录这个例外。

### 5.4 oxlint 规则面过窄

`.oxlintrc.json` 只开 `correctness`/`suspicious`，缺 `import/no-cycle`（4.1）、`style`、`perf` 等 category。建议至少补 `import/no-cycle`，可选补 `perf`。

### 5.5 tsconfig 可更严格 + 两处依赖冗余

- `tsconfig.json` 有 `strict: true`，但缺 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`（两者能暴露大量下标访问和可选属性的潜在 undefined）。
- `types: ["bun-types"]` 与 devDep `@types/bun` 命名不一致（低优先级，typecheck 当前通过，需确认解析路径）。
- `jsdom` 与 `happy-dom` 并存（`@happy-dom/global-registrator` + `jsdom`），冗余，建议统一。
- `typescript: ^7.0.2` 是较新大版本（原生编译器），作为 devDep 需关注与 Bun/oxlint 的兼容性回归。

### 5.6 测试覆盖缺口

85 个测试文件里，以下模块**零测试**：`app/source-registry.ts`、`app/lifecycle.ts`、`app/sync-bootstrap.ts`、`app/shortcut-bootstrap.ts`、`shell/editor.tsx`、`header-state.ts`、`xit/component/header.tsx`、`xit/editor.tsx`、`misc/**`。

而 P0 的 sanitizer（1.1）恰好也没有测试——这正是它敢用自研黑名单的原因。**任何 sanitizer/编解码/合并这类纯逻辑，都该有单测兜底。**

**方案**：优先补 `sanitize`、`header-state`、`source-registry`、`merge` 的纯逻辑单测（成本低、直接锁定本次修的几个 bug）。

---

## 6. 落地路线图（分阶段，不阻塞彼此）

| 阶段                     | 内容                                                                                                                                                                          | 风险                                          | 产出                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| **S1 止血（安全+门禁）** | ① 复用 tnews sanitizer 替换 xueqiu 黑名单（1.1）；② 删 JSX escapeHtml 双重转义（1.2）；③ `.oxlintrc.json` 加 `import/no-cycle`；④ `config/load.ts` 加 `validateConfig`（2.1） | 低                                            | 立即消除 XSS/ReDoS + 暴露环          |
| **S2 拆环 + 收敛类型**   | ① 拆 7 个环（4.1）；② `source-registry` 判别联合（2.6）；③ 预览入口 `PreviewProps`（2.7）                                                                                     | 中（环需逐个下沉符号，先 reddit/hupu 再 xit） | 依赖方向回到 leaf→root               |
| **S3 共享层沉淀**        | ① `shared/sanitize.ts`、`shared/request.ts`、`shared/prune.ts`、`shared/time-parse.ts`、`shared/concurrency.ts`、`keys.ts`                                                    | 中（跨 feature 抽取需比对语义差异）           | 消除 7 份 request、4 份 prune 等复制 |
| **S4 Runtime 收敛**      | ① 补定时器 + `now()` + fake clock；② 替换 8 处裸调用、删全局 patch                                                                                                            | 低                                            | 编排层可确定性测试                   |
| **S5 性能悬崖**          | ① novels `maxLatestWindow` 接线（3.1）；② merge O(n²)（3.2）；③ `mapLimit` 并发（3.3）；④ SafeLine PoW（3.4）                                                                 | 中                                            | 消除 25 分钟/千万级比较              |
| **S6 工程化收尾**        | ① dist 孤儿清理（5.1）；② SWC 降激进（5.2）；③ tsconfig 收紧（5.5）；④ 补 sanitizer/merge/header-state 单测                                                                   | 低                                            | 更稳的 CI 门禁                       |

每个阶段末尾跑 `bun run check` 并报告 `Build hash`。

---

## 7. 未验证项（需实测/决策）

1. **GBK 编码**（4.10）：需 `curl -sI` 确认 sudugu/deqixs 实际 `Content-Type` 再决定是否加 `charset` 兜底。
2. **xueqiu XSS 可利用性**（1.1）：Shadow DOM 内 `<a href>` 的实际点击行为未做浏览器验证；但不影响"应换成白名单 sanitizer"的结论。
3. **配置跨 open/close 保留**：`app/source-registry.ts:16-43` 的 store 随面板 close 不重置，dateFilter/filterUnread 会被保留——无法从代码判断是否有意，需产品确认。
4. **`types:["bun-types"]` vs `@types/bun`**：typecheck 当前通过，但命名不一致需确认解析路径。
5. 本评审为静态阅读 + 只读命令取证，**未运行完整 `bun run check`，未做浏览器验证**；所有 file:line 以评审时点为准。
