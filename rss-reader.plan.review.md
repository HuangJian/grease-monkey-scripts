# RSS Reader Plan Review

> **处置状态（第一轮，已闭环）**
>
> - 判定结果：**接受 9 · 接受并修正 4 · 驳回 1**（共 14 条）。
> - 逐条核对依据与落点见 `rss-reader.plan.md` §9「评审处置台账」（C.1–C.14）。
> - 一句话总结：5 条红色中 3 条完全成立（codec 嵌套压缩、`requirePubDate`、`order` 与 reddit 撞号，且撞在同一 group 内）、1 条只对一半（`source-registry` 里 misc 就是 push，两种写法并存）、1 条对当前文档不成立（计划全文 `grep "fetch("` 无匹配，没有把 `fetch` 写成 `fetch(prev)`）；绿色 C.11 关于 `extractTitle` 「未导出」的事实判断经 `tnews/parser.ts:62` 与 `test/prism/sources/tnews/parser.test.ts:93` 核对为误判，已驳回但采纳其「rss 侧不直接调用」的建议。D9 纯文本摘要获认可。
> - 正文为历史记录，未作修改。

整体评价：**高质量计划**，对代码库的调研深入，设计决策有理有据，分阶段推进节奏合理。以下按严重程度分三级列出需要修正的问题。

---

## 🔴 需要修正的错误

### 1. D2 codec shape `array` 与 `RssFeed[]` 数据结构不兼容

计划称：

> 顶层是数组而非 `{ feeds }`，这样 codec 可直接复用 `array` shape

但 `array` shape 的 [transformShape](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/codec.ts#L386-L389) 只是对顶层数组的**每个元素**调用 `compress`/`expand`。`RssFeed` 内嵌了 `items: RssItem[]`，`array` shape 只会压缩 `RssFeed` 本身，不会递归处理 `items` 里的每个 `RssItem`。

需要定义自定义的 `compressRssFeed`/`expandRssFeed`，在压缩 feed 级别字段的同时 **`items.map(compressRssItem)`**。这与 `novels` shape 压缩 `NovelBook` 内部的 `latestChapters.map(compressNovelChapter)` 是同一个套路。

**结论**：shape `array` 可用，但 `compress`/`expand` 函数必须自行嵌套处理 items。计划里 D8 的 `{i,t,u,e,fa,it:[{i,t,l,p,s}]}` 暗示知道要嵌套压缩，但正文说"直接复用"有误导性。建议明确写："`array` shape 逐 feed 调用 `compressRssFeed`，后者内部对 `items` 逐条压缩"。

### 2. `requirePubDate` 描述与实际不符

计划 D3 说：

> tnews 的 `parser.ts` 改为薄适配：`parseRssItems` 调用 shared 并传 `{ requirePubDate: true }`

但实际 [parseItem](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/tnews/parser.ts) 里 **没有 `requirePubDate` 参数**——它是 `parseItem` 内硬编码的 `if (!pubDate) return null`，无 pubDate 的条目直接返回 `null` 被 `parseRssItems` 用 `.filter(Boolean)` 过滤掉。

这不是参数化的行为，而是写死的。上提到 shared 时需要：

- shared `parseFeed` 默认**保留**无 pubDate 条目（RSS 阅读器需要）
- tnews 适配层在调 shared 之后再 `.filter(it => it.pubDate > 0)` 过滤

计划的意图正确，但描述为"传 `requirePubDate`"会误导实现者以为现有代码已有此参数。

### 3. `Source` 接口签名偏差

计划把 `fetch` 描述为 `fetch(prev)`，但实际签名是：

```ts
fetch(runtime: Runtime, prevData?: T): Promise<T>
```

[Source 定义](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/types.ts#L129) 的 `fetch` **第一个参数是 `runtime`**。同理 `loadState` 也需要 `runtime`。`source.tsx` 的实现需要匹配这个签名。

### 4. `createSourceRegistry` 模式不匹配

计划 §5「修改」表格：

> `sources.push(createRssSource(config.rss, runtime))`

实际 [createSourceRegistry](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/app/source-registry.ts#L27-L57) 是在数组字面量中直接列出所有源，而非先建数组再 push。应改为在 `sources` 数组字面量尾部添加 `createRssSource(config.rss, runtime)`，或像 `xit` 一样条件式 push（如果 rss feeds 为空时不想注册的话）。

### 5. `order: 3` 与已有源冲突

计划说 `order: 3`（tnews=1、novels=2 之后）。但实际：

| Source     | order |
| ---------- | ----- |
| v2ex       | 0     |
| tnews      | 1     |
| novels     | 2     |
| **reddit** | **3** |
| hupu       | 4     |
| xueqiu     | 4/5   |
| misc       | 10    |

`order: 3` 已被 reddit 占用。应选 `order: 6`（在 xueqiu-hot=5 之后、misc=10 之前），或者如果要排在 reddit 之前，则把它设为 `2.5`…… 但 order 是整数，所以应该放到 6 或者往后挪其他源（不建议）。

---

## 🟡 设计建议

### 6. `mapLimit` 是 fail-fast 的——需要包装

[mapLimit](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/shared/concurrency.ts) 行为等同 `Promise.all`：**任一 mapper reject 立即终止全部**。计划 D5 要求「单源失败写入 error、保留 prev items；全部源失败才 throw」。

这意味着 `fetchOne` mapper 函数必须内部 try-catch，永远 resolve（返回带 `error` 字段的 `RssFeed`），只在所有源都走 error 路径后由外层 throw。`mapLimit` 本身不会给你"部分成功"的语义。

计划的意图是对的，但建议在 D5 明确写：**"`fetchOne` 内部 catch 并返回 `{ error, items: prev.items }`，`mapLimit` 外层检查全部 error 才 throw"**，避免实现者误以为 `mapLimit` 有内建的错误隔离。

### 7. `downloadText` 的 `runtime` 参数

[downloadJson](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/export-import.ts) 使用 `runtime.document` 来 `createElement('a')`、`body.appendChild`。计划提取的 `downloadText` 签名里有 `runtime` 参数——这是正确的，因为 DOM 操作必须通过 runtime。确认无问题。

### 8. `save-filter.ts` 的 `SOURCE_LABELS` 也需更新

研究发现 `src/prism/save-filter.ts` 有一个 `SOURCE_LABELS` 映射，用于存储检查器的人类可读描述。添加 `rss` 源时应同步更新。计划未提及此文件。

### 9. 编辑器模式确认

[novels source](file:///Users/hj/dev/github/grease-monkey-scripts/src/prism/novels/source.tsx#L57-L69) 使用 `createEditor(settings: SourceSettings) => SourceEditor` 工厂模式，而非 `renderEditor(ctx)`。计划 §5 列了 `editor/form.tsx`，但 source 描述里混用了两种说法。应明确：rss 的 source 定义要用 `createEditor` 而非 `renderEditor`。

### 10. D9 纯文本摘要——建议通过

同意纯文本方案。100 条/源 × 多源的体积约束是 hard 的，HTML sanitize + render 在 Preact 树内又被 AGENTS.md 禁 `dangerouslySetInnerHTML`。纯文本 + 原文链接是正确的 v1 选择。

如果以后要升级，方向是 token 化解析（参照 AGENTS.md "parse structured content into typed token arrays, render as JSX children"），不是退回到 `dangerouslySetInnerHTML`。

---

## 🟢 小问题 / 建议

### 11. `extractTitle` 实际是 private

计划 D3 列出 `extractTitle` 为 shared 导出，但它在 tnews/parser.ts 里是**未导出**的函数。上提时可以选择导出或保持 private 由 `parseFeed` 内部调用。建议保持 private——RSS 阅读器不需要自己调 `extractTitle`。

### 12. `isShortFeed` 嗅探守卫命名

D8 提到 `isShortFeed` 用于防止重复压缩。这跟现有的 `isShortItem` 嗅探模式一致（看 `typeof v.t === 'string'`）。建议直接复用同一检测逻辑（feed 压缩后 `title` → `t`，所以 `isShortItem` 即可），不需要新增 `isShortFeed`。

### 13. 文件清单中测试目录结构

计划列了：

```
test/prism/rss/{feed-parser,fetcher,merge,state,opml}.test.ts
test/prism/shared/feed-parser.test.ts
```

两处都测 feed-parser。建议统一：shared 解析器只在 `test/prism/shared/feed-parser.test.ts` 测试，`test/prism/rss/` 下不重复。

### 14. `@match` 约束的后果值得强调

计划正确决定不扩大 `@match`，但这意味着 RSS 阅读器**只在 v2ex/github/reddit/hupu/xueqiu 站点上可用**。建议在 R5 收尾阶段的验收条件里加一句提醒："确认空态提示中告知用户仅在已 match 站点可用"，或者考虑空态提示里不提此限制（因为用户到了那些站才能看到仪表盘，所以已经在 match 站点上了）。

---

## 总结

| 类别      | 数量 | 关键项                                                                                                      |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| 🔴 需修正 | 5    | codec 嵌套压缩、`requirePubDate` 不存在、`fetch(runtime, prev)` 签名、registry 不是 push 模式、`order` 冲突 |
| 🟡 建议   | 5    | mapLimit fail-fast、SOURCE_LABELS、createEditor 模式、D9 同意、downloadText 无问题                          |
| 🟢 小问题 | 4    | extractTitle private、isShortFeed 命名、测试目录去重、@match 空态提示                                       |

修正 🔴 项后即可批准执行。D9 纯文本摘要无异议。
