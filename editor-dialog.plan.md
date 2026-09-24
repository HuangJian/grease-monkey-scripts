# 设置弹窗自适应 + novel/rss 编辑器重设计

> 背景：设置弹窗宽度固定，novel / rss 的内容量（50 本书、100 个源）挤在里面无法操作。
> 相关计划：`rss-reader.plan.md`（功能与验收）、`rss-layout.plan.md`（列表布局）。

## 0. 一句话结论

问题分两层，要分开治：**弹窗是「尺寸不会变」**（`width: 520px` 写死，只有 xit 被 JS 特例改成 1200px），**编辑器是「没有为大数据量做信息架构」**（全量平铺、无搜索、无折叠、URL 只读）。先做通用尺寸自适应（一天见效、11 个源全部受益），再按 50 书 / 100 源的量级重做两个编辑器。

## 1. 目标 / 非目标

**目标**

- 弹窗尺寸随视口与内容自适应：小屏不被裁、大屏不浪费；内容多时弹窗变宽变高，body 内部滚动。
- rss（100 源）/ novels（50 书）在弹窗内可**定位、批量操作、就地编辑**，不必靠肉眼翻找。
- 改动对其它 9 个源零回归（tnews / misc / xueqiu / v2ex / xit / hupu / reddit / weather）。

**非目标**

- 不改数据模型、不改存储格式、不改抓取逻辑。
- 不做列表虚拟化（100 行 / 50 组远未到瓶颈，先量再定）。
- 不做弹窗拖拽记忆宽度（见 §6 待定）。
- 不顺手重构编辑器与 source 之间的 `SourceEditor` 契约（只在末尾加一个可选字段）。

## 2. 现状

| 位置                             | 现状                                                                                                         | 问题                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `overlay/editor.css:11`          | `.gm-sp-editor-dialog-panel { width: 520px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px) }` | 尺寸写死；`100vh` 在移动端浏览器工具栏下会溢出                    |
| `shell/editor.tsx:37`            | xit dual 模式 `panelRef.current.style.width = '1200px'`                                                      | 只有一条特例，靠 JS 硬编码，其它源享受不到                        |
| `rss/editor/form.tsx:218-275`    | 源列表平铺：标题输入 + URL 文本 + 启用勾选 + ↑↓×                                                             | 100 行平铺；**URL 只读**（改 URL 只能删了重加）；无搜索/筛选/批量 |
| `novels/editor/form.tsx:237-330` | 50 本书平铺：每本书 = 标题输入 + × + 显示名 + 每个 URL 一行（URL 文本 + 未知站点 + ↑↓×）                     | 50 组全展开；**URL 只读**；无搜索/折叠/批量                       |
| 两者通用                         | 高级设置折叠、保存/取消在弹窗头部                                                                            | 弹窗窄 → 高级项与列表挤在一起                                     |

## 3. 设计决策

### D1 尺寸：编辑器声明档位，CSS 取 min（推荐）

`SourceEditorResult` 增一个可选 `size?: 'sm' | 'md' | 'lg' | 'xl'`；弹窗把它写进 CSS 变量 `--gm-sp-editor-dialog-w`，样式取值：

```css
width: min(var(--gm-sp-editor-dialog-w, 520px), calc(100vw - 32px));
max-height: min(88dvh, calc(100vh - 64px));
```

档位：sm 420（weather/misc）· md 520（默认，v2ex/xueqiu/…）· lg 760（rss）· xl 1080（novels、xit dual）。

- **为什么不是纯内容自适应**（`width: fit-content`）：编辑器里 URL 很长，`fit-content` 会被最长的一行顶到屏幕外；档位可控且可测。
- **为什么不是只改 max-width**：520px 起跳对 100 源仍然太窄，必须从宽度开始分档。
- 顺手把 xit 的 `1200px` 硬编码换成 `size: 'xl'`（值改为 1080，兼顾 1280 宽的屏）。

### D2 布局：头/脚固定，只有 body 滚动

`.gm-sp-editor-dialog-body` 需要 `min-height: 0`（flex 子项不写会撑破 `max-height`，这是这套弹窗最长踩的坑）。列表工具条（搜索/筛选/批量）粘在 body 顶部，`position: sticky; top: 0`，滚动时始终可用来改查询条件。

### D3 大列表信息架构：搜索 + 折叠 + 批量，不做分页

100 行 DOM 与 50 组 DOM 都在毫秒级，分页/虚拟滚动是纯负担。给的是：

- **工具条**：搜索框（标题 + URL 模糊匹配）、状态筛选（全部 / 已启用 / 已禁用 / 失败 / 未知站点）、计数「共 100 · 命中 12」。
- **折叠**：rss 每行默认紧凑，点开就地编辑 URL；novels 每本书默认折成一行摘要（书名 · N 个源 · 状态），点开编辑，附「全部展开 / 全部折叠」。
- **批量**：勾选框 + 全选（仅作用于当前筛选结果，避免误伤看不见的行）+ 启用 / 停用 / 删除所选。删除二次确认（不可撤销）。
- **URL 就地可编辑**：现在两处 URL 都是 `span`，改为折叠后的输入框，保留「未知站点」提示。

### D4 排序：保留 ↑↓，100 源不靠它

↑↓ 保留（微调仍需要），但长距离移动改由搜索缩小范围后操作 —— 不引入拖拽排序（跨 100 行的拖拽在弹窗里更难用，且要新依赖）。

## 4. 实施步骤

**P1 — 弹窗自适应（通用，先做）**

1. `src/prism/types.ts`：`SourceEditorResult` 加 `size?: EditorDialogSize`；导出档位类型。
2. `src/prism/shell/editor.tsx`：读取 `result.size` → 设置面板 CSS 变量；**删掉** xit 的 1200px 特例。
3. `src/prism/overlay/editor.css`：`width: min(var(--w), 100vw - 32px)`、`max-height: min(88dvh, …)`、body `min-height: 0`、工具条 sticky 基类。
4. `src/prism/xit/…`：dual 模式改声明 `size: 'xl'`。
5. 测试：档位映射、无 `size` 时回落 520、视口窄于档位时被夹住（用 CSS 变量断言，不测像素）。

**P2 — RSS 编辑器（100 源）** 6. `rss/editor/form.tsx`：加工具条（搜索 / 筛选 / 计数 / 批量）、行折叠 + URL 可编辑、全选与批量启停删。7. 新增 `rss/editor/list-toolbar.tsx`（工具条与筛选逻辑独立，便于测试），表单只持有状态。8. 测试：搜索命中、筛选联合、全选只作用于可见行、删除确认、URL 编辑写回。

**P3 — Novels 编辑器（50 本书）** 9. `novels/editor/form.tsx`：每本书默认折叠为摘要行、搜索/筛选、全部展开折叠、URL 可编辑、批量删除。10. 测试：折叠默认态、搜索跨书名与 URL、批量删除只作用于命中项。

**P4 — 验证与收尾** 11. 夹具造 50 本书 / 100 个源，在 1440 / 1280 / 1024 / 768 四种视口下量弹窗宽高与 body 滚动（沿用 `tmp/` 里那套 puppeteer 量测脚本）。12. `bun run check`；把 plan 与实现一起提交（本仓库 plan 文档是入库的）。

## 5. 涉及文件

| 文件                                                                                                       | 改动                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/prism/types.ts`                                                                                       | `SourceEditorResult.size` + 档位类型          |
| `src/prism/shell/editor.tsx`                                                                               | 档位 → CSS 变量；删 xit 硬编码                |
| `src/prism/overlay/editor.css`                                                                             | 面板尺寸、body `min-height: 0`、sticky 工具条 |
| `src/prism/xit/*`                                                                                          | dual 模式声明 `size: 'xl'`                    |
| `src/prism/rss/editor/form.tsx`                                                                            | 工具条、折叠、批量、URL 可编辑                |
| `src/prism/rss/editor/list-toolbar.tsx`（新）                                                              | 搜索 / 筛选 / 计数 / 批量条                   |
| `src/prism/novels/editor/form.tsx`                                                                         | 折叠摘要行、搜索、批量                        |
| `test/prism/editor-helpers.test.ts`、`test/prism/rss/editor.test.tsx`、`test/prism/novels/editor.test.tsx` | 档位与交互用例                                |
| `tmp/measure-editor-dialog.mjs`（新）                                                                      | 多视口量测                                    |

## 6. 决策（已拍板）

1. **尺寸**：四档 420 / 520 / 760 / 1080。不做拖拽记忆（多一套存储与把手，收益低）。
2. **列表交互**：搜索 + 筛选 + 折叠、批量选择 + 批量操作、URL 就地可编辑，**全部做**。
3. **长列表**：采用**分页**（每页 50）而非虚拟滚动。理由：展开行高度不定，windowing 需要动态测量行高，复杂度高一个数量级；分页与「全选只作用于当前筛选结果」的语义天然一致；100 源 / 50 本书的规模下，分页 + 搜索已经消除卡顿与翻找。若 P4 实测仍卡，再升为窗口化渲染。
4. **未保存提示**：做。有改动时点取消 / 点遮罩 / ESC 弹二次确认。
5. **删除批量项**：弹窗内二次确认，不做撤销条（不新引入 toast UI）。
6. **批量加源**（novels 一次给多本书加同一镜像站）：**不做**，扩大改动面且需求未验证。
