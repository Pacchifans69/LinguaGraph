# LinguaGraph M0 — Pre-Implementation Engineering Prompt

## 0. 你的角色

你将作为本项目第一阶段的 **Principal Software Architect + Senior Full-Stack Engineer + Test Architect** 工作。

当前任务属于 **Pre-Implementation / 预实现阶段**。

你的职责是把已经确定的产品构想和架构原则转化成一套可以安全实施的工程规格，使下一轮 Codex/Agent 可以据此逐 checkpoint 编码，而无需重新决定产品模型、核心数据结构、Unicode 规则、状态边界和测试策略。

这一轮的核心产物是：

> **经过审查、验证、细化，并且足以直接指导实现的 M0 工程蓝图。**

你可以检查当前 repository、运行环境、工具版本和已有文件；如果 repository 尚为空，则按 greenfield project 处理。

除非为了验证环境或技术假设而确有必要，不要开始正式功能实现。

---

# 1. 项目长期愿景

项目暂定名：

**LinguaGraph**

长期目标是建立一个：

> **Interactive Multilingual Contrastive Linguistics Environment**

即一个面向欧洲语言协同学习、对比语言学和精细平行文本研究的交互式环境。

首要语言：

* English
* German
* French
* Spanish

未来可以加入：

* Italian
* Portuguese
* Dutch
* 其他语言

系统的长期能力包括：

1. 同一材料的多语言版本同步展示；
2. 词、短语、意群、句子之间的跨语言对应；
3. 1:1、1:N、N:1、N:M alignment；
4. 对齐关系的人工编辑；
5. 跨语言 hover / selection / connector visualization；
6. 词汇入口；
7. lemma、POS、morphology；
8. dependency syntax；
9. dictionary / pronunciation / examples；
10. etymology；
11. cognate / borrowing / derivation；
12. cultural / pragmatic notes；
13. 自动 sentence alignment；
14. 自动 word / phrase alignment；
15. human-in-the-loop correction；
16. 最终形成开放的 multilingual linguistic annotation graph。

这些是长期方向。

**M0 只建设这个系统赖以存在的人工对齐基础设施。**

---

# 2. 当前 Milestone

当前阶段正式定义为：

# M0 — Manual Alignment Workbench

M0 的任务是证明以下闭环可靠成立：

> Create Project
> → Create Parallel Document
> → Add arbitrary language Text Versions
> → Open several versions side by side
> → Select arbitrary text spans
> → Collect selections
> → Create multilingual Alignment Group
> → Persist
> → Reload
> → Hover / click one member
> → Locate and highlight all corresponding members
> → Inspect / modify / delete alignment

例如：

English:

> look forward to

German:

> freue mich darauf

French:

> ai hâte de

Spanish:

> tengo ganas de

用户可以手工建立一个包含这些 span 的 Alignment Group。

刷新应用之后，该 alignment 仍然存在。

点击其中任意一个 member，其余成员均可被可靠定位、突出显示和检查。

---

# 3. M0 成功标准

M0 成功与否只评价以下三个方面：

### 3.1 Data model correctness

模型必须能长期承载：

* arbitrary languages；
* multiple translations of the same language；
* N:M alignment；
* discontinuous alignment 的未来扩展；
* overlapping annotation；
* additional linguistic layers。

### 3.2 Annotation reliability

文本选择、offset、Unicode normalization、持久化和 reload 必须严格可靠。

任何“看起来选中了正确文本、数据库实际保存了错误 offset”的情况均属于严重缺陷。

### 3.3 Interaction model viability

M0 应证明：

> 多窗口平行文本 + 手工 span selection + alignment tray + cross-language highlighting + connectors

这一交互范式确实可用。

---

# 4. 第一组冻结原则：Language Neutrality

核心数据库 schema 中不得存在：

* english_text
* german_text
* french_text
* spanish_text
* portuguese_text
* language-specific alignment table

语言属于数据。

TextVersion 使用：

`language_tag`

进行语言识别。

语言标签采用：

**BCP 47 / RFC 5646**

例如：

* `en`
* `en-GB`
* `de`
* `de-CH`
* `fr`
* `fr-CA`
* `es`

核心架构验收规则：

> 新增 Portuguese、Italian、Dutch 等语言时，不允许要求修改核心 schema。

---

# 5. 第二组冻结原则：Alignment 与 Linguistic Relation 分层

M0 中的 Alignment 只有一个语义：

> **这些文本 occurrence 在当前 ParallelDocument 中形成对应关系。**

M0 不实现：

* cognate
* borrowing
* derivation
* calque
* false friend
* semantic relation
* syntax relation
* lexical identity

例如：

English `water`

German `Wasser`

以后可以同时具有：

1. 当前句子中的 translation alignment；
2. 历史语言学中的 cognate relation。

这两种关系属于不同层。

因此未来总体模型应能够形成：

```text
Text occurrence layer
        ↓
Alignment layer
        ↓
Linguistic annotation / knowledge layer
```

M0 只建设前两层中的基础部分。

不要提前把历史语言学 ontology 塞进 AlignmentGroup。

---

# 6. 核心 Domain Model

M0 的核心实体限定为：

1. Project
2. ParallelDocument
3. TextVersion
4. Span
5. AlignmentGroup
6. AlignmentMember

关系：

```text
Project
  └── ParallelDocument
        └── TextVersion
              └── Span

ParallelDocument
  └── AlignmentGroup
        └── AlignmentMember
              └── Span
```

AlignmentGroup 应被理解为一种 hyperedge：

> 一个 AlignmentGroup 可以连接任意数量的 Span。

禁止将其实现为单纯：

```text
source_span_id
target_span_id
```

这种 pairwise translation model。

---

# 7. Project

建议字段：

```text
id
name
description
created_at
updated_at
```

M0 为单用户本地工作台。

因此 M0 不需要：

* User
* Organization
* Workspace ACL
* Authentication
* Authorization

---

# 8. ParallelDocument

一个 ParallelDocument 表示：

> 同一份语义材料或同一作品单位。

例如：

```text
Le Petit Prince — Chapter 1
```

其下可以具有：

```text
French original
English translation A
English translation B
German translation
Spanish translation
```

建议字段：

```text
id
project_id
title
description
created_at
updated_at
```

---

# 9. TextVersion

TextVersion 表示某一份实际文本版本。

建议字段：

```text
id
document_id
language_tag
label
content
content_hash
created_at
updated_at
```

关键 invariant：

同一个 ParallelDocument 中允许：

```text
de version A
de version B
```

因此：

```text
UNIQUE(document_id, language_tag)
```

是不允许的。

需要考虑是否为 TextVersion 增加 stable ordering / metadata 字段，请在预实现阶段评估。

任何新增字段都必须说明它解决的现实问题。

---

# 10. Canonical Text

TextVersion.content 是 annotation system 的 canonical source text。

进入系统时统一执行：

1. decode / accept UTF-8；
2. CRLF → LF；
3. CR → LF；
4. Unicode normalize to NFC；
5. 保留正文空格；
6. 不 collapse whitespace；
7. 不自动 lowercase；
8. 不自动改变 punctuation；
9. 不使用 NFKC；
10. 不自动 trim 整份正文。

必须明确：

> TextVersion.content 一经 canonicalization，所有 span offsets 都针对这一 canonical string。

在预实现设计中，请明确：

* normalization 在哪一层执行；
* frontend 是否显示 canonicalized result；
* `.txt` import 时 normalization 发生在哪；
* content_hash 基于 normalization 前还是后；
* normalization 的 test vectors。

---

# 11. Span Model

Span 表示：

> 一个 TextVersion 上的半开区间 `[start, end)`。

采用：

* zero-based
* start inclusive
* end exclusive

建议字段：

```text
id
text_version_id
start_offset
end_offset
exact_text
prefix
suffix
created_at
```

其中：

```text
exact_text
prefix
suffix
```

是 annotation anchoring metadata。

它们不能成为正文的第二份 authority。

核心 invariant：

```text
TextVersion.content[start_offset:end_offset] == exact_text
```

必须始终成立。

---

# 12. Offset 的唯一规范

这是 M0 最高风险区域之一。

数据库和 API 中所有文本 offset：

# 必须使用 Unicode code-point offsets

禁止直接把：

> JavaScript UTF-16 code-unit offset

写入数据库。

JavaScript DOM / String / Range 与 Python Unicode string 在 supplementary-plane characters 上可能产生 offset disagreement。

例如：

```text
A🙂B
```

数据库语义必须以 Unicode code points 为准。

因此需要一个独立的、经过严格测试的 frontend utility layer：

```text
DOM / UTF-16 offset
        ⇅
canonical Unicode code-point offset
```

要求：

* conversion logic 只能有一个 canonical implementation；
* React component 不得自行重复实现 offset conversion；
* API 永远只理解 code-point offsets。

在预实现阶段，请把这一算法精确设计出来。

需要明确处理：

* surrogate pairs；
* combining marks；
* NFC；
* selection direction；
* Range endpoints；
* selections crossing nested rendered spans；
* overlapping annotation runs；
* selection ending at run boundary；
* emoji；
* astral-plane characters。

---

# 13. Grapheme Cluster

数据库 offset 单位仍然采用：

> Unicode code point

同时 UI selection 不应主动产生切断用户感知 grapheme cluster 的无效 selection。

预实现阶段请评估：

* 浏览器 native selection 已提供哪些保证；
* 是否需要额外 boundary validation；
* M0 是否只检测明显非法 boundary；
* 将完整 grapheme-aware editing 推迟到哪个阶段。

不要擅自改成 UTF-16。

不要擅自改成 byte offset。

不要擅自改成 grapheme-cluster index。

如果认为 code-point model 存在严重工程问题，请形成 ADR proposal，禁止静默修改。

---

# 14. Span Quote Context

创建 Span 时：

客户端只发送：

```text
textVersionId
start
end
```

服务器自行计算：

```text
exact_text
prefix
suffix
```

建议初始上下文：

```text
prefix = preceding 32 code points
suffix = following 32 code points
```

该长度属于 recommendation，可以在预实现阶段评估。

禁止相信客户端提供的 exact string。

未来 TextVersion revision / re-anchoring 可以利用：

* position
* exact quote
* context quote

共同恢复 annotation。

M0 暂不实现 re-anchoring。

---

# 15. AlignmentGroup

建议字段：

```text
id
document_id
note
created_at
updated_at
```

Alignment 不拥有：

```text
source_language
target_language
source_span
target_span
```

Alignment 默认是对称 correspondence。

当前 UI 可以把某个语言视作 reference language，但该状态不能污染 domain ontology。

---

# 16. AlignmentMember

建议字段：

```text
alignment_group_id
span_id
```

需要：

* FK
* uniqueness constraints
* suitable indexes

一个 AlignmentGroup：

* 可以包含多个语言；
* 可以包含两个语言；
* 可以包含同一 TextVersion 的多个 Span；
* 可以连接 1:1；
* 可以连接 1:N；
* 可以连接 N:1；
* 可以连接 N:M。

这一点必须从第一版 schema 就成立。

---

# 17. Alignment Invariants

Service / domain 层至少验证：

### 必须满足

1. AlignmentGroup 至少有 2 个成员；
2. 成员必须来自至少 2 个不同 TextVersion；
3. 所有 TextVersion 必须属于同一个 ParallelDocument；
4. Span 满足：

```text
0 <= start < end <= len(content)
```

5. exact_text 必须与 canonical content 一致；
6. 同一个 Span 不得在同一 AlignmentGroup 重复出现。

### 应允许

不同 AlignmentGroup 的 Span 可以 overlap。

例如：

```text
[United States]
        [States]
```

可以属于不同 annotation/alignment。

### 同一 AlignmentGroup、同一 TextVersion

需要支持未来 discontinuous correspondence，例如：

```text
[freue] ... [darauf]
```

因此同一 TextVersion 可贡献多个 Span。

M0 中建议：

* duplicate 禁止；
* overlap 禁止；
* separated 允许；
* adjacent 允许。

请在预实现阶段验证这一规则是否存在反例，并把最终结论写成 invariant。

---

# 18. Span Reuse

如果数据库已经存在完全相同：

```text
text_version_id
start_offset
end_offset
```

的 Span，新建 Alignment 时应优先复用现有 Span，而不是生成重复实体。

请设计对应：

* database uniqueness；
* service lookup；
* transaction behavior；
* concurrency behavior。

即使 M0 是单用户，也要避免逻辑性 duplicate。

---

# 19. Text Immutability Policy

M0 采用：

# Import → Annotate

TextVersion 一旦已经拥有 Span / Alignment annotation：

普通正文编辑必须关闭。

允许：

### 尚未存在 annotation

正文可以被替换。

### 已存在 annotation

正文 mutation 必须：

* 被禁止；
* 或通过明确的 destructive reset flow。

M0 不实现：

* incremental re-anchoring；
* automatic offset remapping；
* document revisions；
* operational transforms；
* CRDT；
* collaborative live editing。

请在预实现阶段设计最简单且不破坏数据的 UX。

明确 API 是否提供 content replacement endpoint，以及它的前置条件。

不要通过通用：

```text
PATCH TextVersion
```

让 content 悄悄发生变化。

---

# 20. Pending Selection

用户选择文本后，尚未提交的 selection 属于：

> ephemeral frontend state

例如：

```text
EN: look forward to
DE: freue mich darauf
FR: ai hâte de
```

这些 pending spans 暂时不进入数据库。

只有点击：

> Create Alignment

之后才通过单一 atomic request 写入。

好处包括：

* 不产生 orphan Span；
* 不产生 half-built Alignment；
* cancel 无数据库副作用；
* transaction boundary 清晰。

---

# 21. Create Alignment Transaction

一次创建 alignment 的 request 至少包含：

```text
document_id

members:
  - text_version_id
    start
    end
```

服务器必须在一个 transaction 内：

1. load document；
2. load referenced TextVersions；
3. verify ownership；
4. verify offset ranges；
5. derive exact_text；
6. derive prefix；
7. derive suffix；
8. reuse or create Span；
9. create AlignmentGroup；
10. create AlignmentMembers；
11. validate final cardinality；
12. commit。

任一步失败：

> rollback whole operation

不得产生 orphan objects。

---

# 22. Frontend Workspace

M0 推荐整体结构：

```text
┌─────────────────────────────────────────┐
│ Toolbar                                 │
├───────────────┬─────────────────────────┤
│ Navigator     │ Workspace               │
│               │                         │
│ Projects      │ Text Panels             │
│ Documents     │                         │
│ Versions      │                         │
├───────────────┴──────────────────┬──────┤
│ Alignment Tray                  │Inspector
└──────────────────────────────────┴──────┘
```

核心区域：

1. Navigator
2. Workspace
3. TextPanel
4. Alignment Tray
5. Alignment Inspector
6. SVG Connector Overlay

---

# 23. TextPanel

每个 TextVersion 独立显示。

Header 至少显示：

```text
language
language tag
label
close/hide control
```

M0 支持：

* show / hide；
* panel reorder；
* adaptive 1 / 2 / 3 / 4+ panels；
* independent scrolling。

M0 暂不实现：

* floating desktop windows；
* arbitrary docking framework；
* multi-monitor；
* sophisticated splitter manager；
* synchronized semantic scrolling。

尤其不要实现：

```text
scrollTop A = scrollTop B
```

这种伪同步滚动。

真正的 semantic synchronized scrolling 应等待 sentence alignment。

---

# 24. Manual Alignment Interaction

建议 interaction：

### Step 1

用户在 TextPanel 选取：

```text
look forward to
```

提供：

```text
Add to Alignment
```

### Step 2

Alignment Tray：

```text
EN — look forward to
```

### Step 3

选择：

```text
DE — freue mich darauf
```

### Step 4

继续：

```text
FR — ai hâte de
ES — tengo ganas de
```

### Step 5

点击：

```text
Create Alignment
```

然后 atomic persistence。

必须支持：

* remove pending member；
* clear tray；
* cancel；
* duplicate prevention；
* minimum member validation。

请在预实现阶段明确：

* native selection 如何进入 tray；
* selection 是否自动消失；
* selection tooltip/button 位置；
* keyboard interaction；
* repeated selection behavior；
* same-version multi-span behavior。

---

# 25. Alignment Visualization

为了避免大量 alignment 同时显示形成 spaghetti diagram：

### Idle

只显示轻量 annotation indicator。

### Hover

突出：

* hovered span；
* 同 AlignmentGroup 的其它 span；

并临时显示 connectors。

### Selected

保持：

* highlight；
* connectors；

并打开 Alignment Inspector。

禁止默认永久展示全文所有 alignment connectors。

---

# 26. SVG Connector Overlay

Workspace 上方可以使用一个：

```text
SVG overlay
```

要求：

```text
pointer-events: none
```

active / hovered alignment 时：

1. locate rendered member ranges；
2. obtain ClientRects；
3. calculate panel-relative coordinates；
4. draw lightweight connectors；
5. recompute on scroll；
6. recompute on resize。

需要考虑：

* span wraps across multiple visual lines；
* multiple ClientRects；
* independently scrolling panels；
* member outside viewport；
* same-language multiple fragments；
* panel reorder；
* hidden panels。

M0 不要求复杂 edge routing。

目标：

> visually clear, stable, non-interfering.

---

# 27. Rendering Overlapping Spans

禁止：

> one DOM element per character。

推荐：

# Boundary Segmentation

例如已有 spans：

```text
A = [10,20)
B = [15,25)
```

boundaries：

```text
0
10
15
20
25
text_end
```

据此建立 minimal text runs。

每个 run 可以拥有：

```text
absolute_start
absolute_end
alignment membership
```

因此：

```text
[15,20)
```

可以同时属于 A 和 B。

请在预实现阶段给出：

* segmentation algorithm；
* complexity；
* data structure；
* React key strategy；
* selection compatibility；
* update behavior。

该算法未来需要承载：

* lexical annotation；
* syntax annotation；
* POS annotation；
* phrase annotation。

因此需要保持通用性，同时避免提前实现这些未来 feature。

---

# 28. Selection Engine 必须独立

必须建立 framework-light / domain-level utilities，负责：

```text
DOM Range
        →
canonical code-point range
```

以及反向定位。

Selection Engine 至少负责：

* DOM Range → canonical offsets；
* canonical offsets → rendered ranges / members；
* forward/backward selection normalization；
* reject empty selection；
* reject cross-TextVersion selection；
* UTF-16 ↔ code-point conversion；
* boundary calculations；
* rendered-run mapping。

禁止把这些逻辑散落在：

```text
TextPanel.tsx
AlignmentTray.tsx
Inspector.tsx
```

之中。

这是整个项目未来 annotation infrastructure 的公共底座。

---

# 29. Unicode Regression Suite

M0 必须拥有专门的 Unicode test vectors。

至少包括：

### ASCII

```text
hello world
```

### French

```text
café français
```

### Spanish

```text
mañana
```

### German

```text
für größere Häuser
```

### Combining sequence

例如 normalization 前：

```text
Cafe + COMBINING ACUTE ACCENT
```

canonical storage 后应符合 NFC。

### Astral-plane / surrogate pair

```text
A🙂B
```

### Mixed

```text
Café 🙂 mañana für français
```

测试：

* selection；
* offset；
* exact_text；
* save；
* reload；
* highlight；
* connector anchor。

这一测试集属于 M0 mandatory suite。

---

# 30. API Namespace

统一使用：

```text
/api/v1
```

即使当前只有 v1。

---

# 31. API Families

至少规划：

## Infrastructure

```text
GET /api/v1/health
```

## Projects

create / list / get / update metadata / delete

## Documents

create / list / get / update metadata / delete

## TextVersions

create / get / metadata update / delete

正文 mutation 必须符合 Text Immutability Policy。

## Alignments

list / create / get / update members or note / delete

---

# 32. Workspace Read Model

避免 frontend request waterfall。

建议提供：

```text
GET /api/v1/documents/{id}/workspace
```

一次返回：

* document metadata；
* TextVersions；
* Spans；
* AlignmentGroups；
* AlignmentMembers。

请在预实现阶段设计：

* exact response shape；
* normalization；
* sorting；
* payload duplication；
* whether Span objects are normalized into lookup maps；
* pagination 是否 M0 需要。

当前倾向：

> M0 不做 pagination，先保证 document-level snapshot 简单可靠。

如果你认为存在明显问题，请提出证据。

---

# 33. API Error Contract

禁止前端解析数据库 exception string。

统一 domain error。

至少考虑：

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
SPAN_OUT_OF_RANGE
CROSS_DOCUMENT_ALIGNMENT
INSUFFICIENT_ALIGNMENT_MEMBERS
TEXT_HAS_ANNOTATIONS
DUPLICATE_ALIGNMENT_MEMBER
```

response 应明确区分：

```text
code
message
details
```

请给出标准 JSON contract。

---

# 34. Frontend State Ownership

严格区分：

## Server State

使用：

**TanStack Query**

负责：

* projects；
* documents；
* workspace；
* alignments。

## Ephemeral UI State

React local state / reducer / narrowly scoped Context：

* current selection；
* pending members；
* hovered alignment；
* active alignment；
* panel order；
* visible panels。

## Local Preference

可以考虑 localStorage：

* panel visibility；
* panel order；
* density。

M0 暂时不使用：

* Redux；
* Zustand；

除非预实现审查发现明确必要性。

如果提出新 state library，必须解释现有模型为什么不足。

---

# 35. Backend Architecture

采用：

# Modular Monolith

推荐层次：

```text
HTTP Route
    ↓
Application / Domain Service
    ↓
SQLAlchemy persistence
```

例如：

```text
create_alignment route
    ↓
AlignmentService.create(...)
    ↓
transaction
```

Route 只负责：

* request；
* authentication future boundary；
* schema parsing；
* service invocation；
* HTTP response mapping。

复杂 domain logic 放 service。

不要创建没有现实价值的：

* AbstractFactory；
* GenericRepository；
* BaseManager；
* Enterprise-style service locator。

抽象必须来自实际重复和边界。

---

# 36. Baseline Technology Stack

当前 baseline：

## Frontend

```text
React
TypeScript
Vite
TanStack Query
```

UI state：

```text
React state / reducer / Context
```

## Backend

```text
Python 3.13.x
FastAPI
Pydantic
SQLAlchemy 2.0
Alembic
```

## Database

```text
PostgreSQL
```

当前计划以 PostgreSQL 18 为目标。

## Python environment

```text
uv
```

## Node

```text
Node 24 LTS
```

## Backend tests

```text
pytest
```

## Frontend tests

```text
Vitest
React Testing Library
```

## E2E

```text
Playwright
```

---

# 37. Version Verification Rule

预实现阶段请实际检查当前环境和官方兼容性。

以上版本属于 baseline decisions。

允许提出修改建议的条件：

* runtime 在目标环境不可用；
* package compatibility 有明确冲突；
* security/support 状态已经改变；
* tooling 已发生重大稳定版迁移；
* repository 已有合理且兼容的现成约束。

如果需要偏离：

1. 不要自行实施；
2. 在报告中列出：

   * baseline；
   * discovered reality；
   * risk；
   * proposed replacement；
   * migration cost；
3. 标记为：

```text
DECISION REQUIRED
```

不要为了追逐“最新版”而升级。

稳定性优先。

---

# 38. ORM / API Model Separation

保持：

```text
SQLAlchemy model
```

负责 persistence。

```text
Pydantic schemas
```

负责 API boundary。

不要让同一个 class 同时承担：

* database；
* API；
* domain；
* frontend contract。

预实现阶段请给出模型层次和命名约定。

---

# 39. Database Modeling Principle

M0 的关系数据应正常关系化。

不要为了“以后方便”把核心 domain 塞入：

```text
JSONB
```

JSONB 只在真实存在开放 metadata requirement 时考虑。

禁止 M0 引入：

* Neo4j；
* RDF store；
* vector database；
* Elasticsearch；
* Redis。

未来语言知识图谱是否使用 graph database，留给未来 milestone 根据实际查询需求决定。

---

# 40. Migration Discipline

第一天开始使用：

**Alembic**

要求：

* schema migration version controlled；
* clean database 可以从零迁移至 HEAD；
* tests 验证 migrations；
* application startup 不依赖 `create_all()` 偷偷修改 schema。

请在预实现阶段明确：

* development migration workflow；
* CI migration check；
* rollback philosophy；
* naming convention。

---

# 41. Repository Layout Baseline

优先考虑简单 monorepo：

```text
/
├── apps/
│   ├── web/
│   └── api/
├── docs/
├── infra/
├── compose.yml
├── README.md
└── ...
```

frontend 内建议按 feature/domain 组织：

```text
src/
├── app/
├── features/
│   ├── projects/
│   ├── documents/
│   ├── workspace/
│   └── alignments/
└── shared/
    ├── api/
    ├── text/
    └── ui/
```

backend 可以类似：

```text
app/
├── api/
├── core/
├── db/
├── schemas/
├── services/
├── text/
└── tests/
```

你需要在预实现阶段检查该结构是否合理，并给出最终 tree。

不要因为 monorepo 自动引入：

* Nx；
* Turborepo；
* Bazel。

除非现有仓库已经有这些工具。

---

# 42. Import Scope

M0 支持：

* paste plain text；
* UTF-8 `.txt`。

M0 不支持：

* PDF；
* DOCX；
* EPUB；
* HTML scraping；
* URL import；
* subtitle formats；
* OCR。

Importer 未来可以扩展。

当前只需保证 canonical text ingestion contract 正确。

---

# 43. Security Baseline

M0 为本地单用户工具，但仍需要：

* schema validation；
* request size limits；
* text size limits；
* safe database parameterization；
* development CORS narrowly configured；
* plain-text rendering；
* no raw HTML execution。

用户文本：

```html
<script>alert(1)</script>
```

必须作为普通文本显示。

禁止为了显示 annotation 使用不受控：

```text
dangerouslySetInnerHTML
```

如果认为存在安全实现方案需要该 API，必须在预实现报告中专门论证。

---

# 44. Accessibility Baseline

M0 至少满足：

* TextPanel header 有合理语义；
* icon button 有 accessible name；
* active/focus state 可见；
* alignment 状态不能只依赖颜色；
* Escape 可以取消 pending interaction；
* Inspector 可键盘访问；
* native selection 不被破坏。

不要求这一阶段完成完整 WCAG audit。

要求基础架构不要人为阻碍 accessibility。

---

# 45. Desktop Target

LinguaGraph 是 dense desktop workbench。

M0 首要 viewport：

```text
1366×768
1920×1080
```

首要浏览器：

* Chromium；
* Microsoft Edge；
* Firefox。

Playwright 可以覆盖主流 engines。

M0 不投入大量资源实现 mobile responsive application。

---

# 46. Performance Target

M0 暂不做文本 virtualization。

原因：

```text
virtualized rich text
+
native DOM selection
+
overlapping annotation
+
connector geometry
```

会大幅提升复杂度。

工程目标：

单个 TextVersion 至少能够可靠处理大约：

```text
100,000 Unicode code points
```

一个 ParallelDocument：

```text
hundreds of alignments
```

当前属于 practical engineering target，不需要包装为严格 SLA。

请在预实现阶段判断是否需要简单 benchmark harness。

---

# 47. Testing Architecture

测试不能在实施最后补。

需要从 architecture 直接派生。

---

# 48. Backend Unit Tests

至少覆盖：

* normalization；
* newline canonicalization；
* offset validation；
* exact extraction；
* prefix/suffix；
* alignment invariants；
* duplicate span reuse；
* same-version multiple members；
* overlap rules；
* invalid cross-document alignment。

---

# 49. Backend Integration Tests

必须针对真正 PostgreSQL 运行关键 integration tests。

至少覆盖：

* API → service → ORM → PostgreSQL；
* FK；
* cascade；
* transaction rollback；
* uniqueness；
* migrations；
* text immutability rules。

不要只使用 SQLite 代替 PostgreSQL 然后声称数据库行为得到验证。

---

# 50. Frontend Unit Tests

至少覆盖：

* UTF-16 ↔ code-point conversion；
* DOM selection mapping；
* boundary segmentation；
* overlapping runs；
* pending tray reducer；
* duplicate pending members；
* hover propagation；
* active alignment state；
* invalid selection rejection。

---

# 51. E2E Golden Path

必须规划至少一个完整 Playwright scenario：

## Document

EN:

```text
I look forward to seeing you tomorrow.
```

DE:

```text
Ich freue mich darauf, dich morgen zu sehen.
```

FR:

```text
J’ai hâte de te voir demain.
```

ES:

```text
Tengo ganas de verte mañana.
```

操作：

1. create Project；
2. create ParallelDocument；
3. add four TextVersions；
4. open four panels；
5. select:

   * `look forward to`
   * `freue mich darauf`
   * `ai hâte de`
   * `Tengo ganas de`
6. create alignment；
7. reload browser；
8. verify alignment persists；
9. hover EN member；
10. verify DE / FR / ES highlight；
11. click alignment；
12. verify Inspector shows four members；
13. remove FR member；
14. verify remaining EN / DE / ES alignment remains valid；
15. delete AlignmentGroup；
16. verify annotation indicators disappear。

---

# 52. Unicode E2E

至少包含：

```text
Café 🙂 mañana für français
```

需要在 emoji 前后建立 selection。

验证：

* canonical content；
* code-point start/end；
* exact_text；
* persistence；
* reload；
* rendering；
* highlight。

该测试属于 release blocker。

---

# 53. M0 Explicit Non-Goals

这一列表具有强约束性。

当前禁止实现：

* DeepL integration；
* Google Translate；
* machine translation；
* LLM；
* sentence alignment；
* word alignment；
* phrase alignment；
* Stanza；
* Universal Dependencies；
* syntax tree；
* dictionary；
* pronunciation；
* etymology；
* Wiktionary；
* cognate detection；
* embedding；
* vector search；
* AI recommender；
* authentication；
* OAuth；
* JWT；
* collaboration；
* WebSocket；
* CRDT；
* Neo4j；
* Redis；
* Elasticsearch；
* Kafka；
* microservices；
* native desktop packaging；
* mobile app；
* browser extension；
* PDF reader；
* EPUB reader；
* floating window manager；
* sophisticated synchronized scrolling。

即便其中某些功能容易加入，也不要在 M0 实现。

---

# 54. Planned Implementation Checkpoints

M0 未来施工分为：

## M0.1 — Repository Foundation

目标：

* monorepo；
* frontend；
* backend；
* database；
* migrations；
* configuration；
* health endpoint；
* lint；
* typecheck；
* test harness；
* developer setup。

---

## M0.2 — Persistence Model

目标：

* Project；
* ParallelDocument；
* TextVersion；
* Span；
* AlignmentGroup；
* AlignmentMember；
* migrations；
* constraints；
* service-level invariants。

---

## M0.3 — Document Workspace

目标：

* project navigation；
* document management；
* text import；
* TextVersion panels；
* open/hide/reorder；
* workspace query。

---

## M0.4 — Selection Engine

目标：

* native selection；
* DOM Range → code-point offsets；
* canonical offset conversion；
* Unicode behavior；
* run segmentation；
* pending selection。

这是 M0 技术风险最高 checkpoint。

---

## M0.5 — Manual Alignment

目标：

```text
select
→ tray
→ create
→ persistence
```

并支持：

* 1:1；
* 1:N；
* N:1；
* N:M；
* same-version multiple spans；
* edit；
* delete。

---

## M0.6 — Alignment Visualization

目标：

* annotation indicators；
* cross-panel hover；
* active alignment；
* SVG connectors；
* Inspector；
* note。

---

## M0.7 — Hardening

目标：

* integration tests；
* E2E；
* Unicode regression；
* error handling；
* loading；
* empty states；
* accessibility；
* migration-from-zero；
* clean production build；
* documentation。

---

# 55. 这一轮 Pre-Implementation 的具体任务

你现在不要直接执行 M0.1–M0.7。

你需要先对上述方案做一次完整工程审查。

必须完成以下任务。

---

# 56. Task A — Repository Reconnaissance

如果 repository 已存在：

检查：

* directory tree；
* existing source；
* package manifests；
* lockfiles；
* runtime versions；
* git status；
* existing configuration；
* Docker / Compose；
* migrations；
* tests；
* CI；
* documentation。

输出：

```text
CURRENT REPOSITORY STATE
```

说明：

* 什么已经存在；
* 什么可以保留；
* 什么与 M0 冲突；
* 什么需要迁移；
* 是否存在技术债。

不要删除已有内容。

---

# 57. Task B — Validate Frozen Architecture

逐项审查：

* language-neutral model；
* TextVersion abstraction；
* Span abstraction；
* N:M AlignmentGroup；
* AlignmentMember；
* Unicode normalization；
* code-point offsets；
* immutable annotated text；
* atomic alignment transaction；
* overlapping span rendering；
* frontend/backend state boundaries。

输出三类：

```text
CONFIRMED
NEEDS REFINEMENT
BLOCKING PROBLEM
```

如果发现 blocking problem：

必须：

1. 给出具体反例；
2. 说明哪个未来 milestone 会因此失败；
3. 提出最小修改方案；
4. 禁止静默修改冻结原则。

---

# 58. Task C — Produce Final Domain Specification

输出完整 domain spec：

* entities；
* fields；
* types；
* nullability；
* relationships；
* cardinalities；
* uniqueness；
* indexes；
* FK behavior；
* cascade rules；
* timestamp policy；
* IDs；
* invariants；
* deletion semantics。

需要明确：

例如删除：

```text
TextVersion
```

时：

* Span 怎么处理；
* AlignmentGroup 变成单成员怎么办；
* 是否阻止删除；
* 是否 cascade；
* 是否 transactional cleanup。

这些语义必须在编码前决定。

---

# 59. Task D — Produce ER Model

给出：

1. human-readable ER explanation；
2. Mermaid ER diagram；
3. database-level constraints；
4. service-level constraints。

明确指出：

哪些 invariant：

> database 可以保证；

哪些必须：

> service/application 保证。

---

# 60. Task E — Specify Canonical Text Contract

完整定义：

```text
Input Text
    ↓
Canonicalization
    ↓
Canonical TextVersion.content
    ↓
Offsets
    ↓
Span
```

明确：

* newline；
* NFC；
* UTF-8；
* file decoding；
* BOM；
* null characters；
* invalid Unicode；
* empty text；
* whitespace-only text；
* maximum size；
* content hash。

输出实际 test vectors：

```text
input
expected canonical content
expected code-point length
```

---

# 61. Task F — Specify Selection Engine

这是预实现最重要产物之一。

请详细设计：

```text
native Selection / Range
        ↓
TextPanel root
        ↓
rendered runs
        ↓
UTF-16 positions
        ↓
Unicode code-point offsets
        ↓
PendingSpan
```

必须解释：

* DOM structure assumptions；
* mapping algorithm；
* complexity；
* utility APIs；
* edge cases；
* cross-node selection；
* overlapping span rendering；
* backward selection；
* multi-line selection；
* surrogate pairs；
* composed/decomposed text；
* panel boundaries。

提供 TypeScript-level interface design。

可以给 pseudo-code。

这一轮不要实现完整 production code。

---

# 62. Task G — Specify Rendering Model

设计：

```text
Canonical text
+
Persisted spans
+
Alignment memberships
        ↓
Boundary segmentation
        ↓
Rendered runs
```

需要明确：

* inputs；
* output structure；
* React representation；
* overlapping annotation；
* selection；
* hover；
* active；
* render invalidation；
* stable keys。

提供 algorithm pseudo-code 和测试矩阵。

---

# 63. Task H — Specify Connector Geometry

设计 M0 connector model：

* anchor；
* ClientRects；
* line wrap；
* hidden panel；
* offscreen member；
* scroll；
* resize；
* panel reorder。

输出：

* connector state model；
* recomputation triggers；
* event strategy；
* performance precautions。

避免复杂路由。

---

# 64. Task I — Specify API Contract

给出所有 M0 endpoint。

对于每个 endpoint：

* method；
* path；
* request；
* response；
* HTTP status；
* domain errors；
* mutation semantics；
* transaction boundary。

重点详细设计：

```text
POST alignment
PATCH alignment members
DELETE alignment
GET workspace
```

给出 JSON examples。

---

# 65. Task J — Specify Frontend Architecture

明确：

* route tree；
* feature modules；
* query keys；
* TanStack Query ownership；
* mutation invalidation；
* Context boundaries；
* reducers；
* localStorage；
* reusable shared text utilities。

避免 global state soup。

---

# 66. Task K — Specify Backend Architecture

明确：

* package tree；
* configuration；
* dependency injection；
* DB session lifecycle；
* transaction ownership；
* service boundaries；
* domain exception mapping；
* Pydantic schemas；
* logging；
* testing seams。

避免无意义 abstraction。

---

# 67. Task L — Testing Matrix

制作 requirements → tests traceability matrix。

例如：

| Requirement          | Unit | Integration | E2E      |
| -------------------- | ---- | ----------- | -------- |
| NFC                  | yes  | yes         | yes      |
| code-point offsets   | yes  | optional    | yes      |
| N:M alignment        | yes  | yes         | yes      |
| transaction rollback | no   | yes         | optional |

M0 每条关键 invariant 必须至少有一个 test owner。

---

# 68. Task M — Failure Mode Analysis

至少分析：

* emoji offset corruption；
* stale selection；
* overlapping spans；
* deleting version with alignments；
* duplicate spans；
* failed transaction；
* stale frontend cache；
* panel reorder breaking connectors；
* scroll geometry drift；
* browser selection crossing panels；
* NFC changing length；
* copied CRLF text；
* huge pasted text；
* XSS-like text；
* malformed BCP-47 tag；
* backend restart；
* database unavailable。

给出：

```text
failure
impact
detection
prevention
recovery
test
```

---

# 69. Task N — ADR Set

至少拟定：

```text
ADR-001 Unicode code-point offsets
ADR-002 NFC canonical text
ADR-003 Alignment vs linguistic relations
ADR-004 PostgreSQL relational persistence
ADR-005 Annotated text immutability in M0
ADR-006 AlignmentGroup as N:M hyperedge
ADR-007 Pending selections remain client-side
ADR-008 Modular monolith
```

每份 ADR 至少包括：

* Context
* Decision
* Alternatives considered
* Consequences

如果审查发现新的 foundational decision，可以新增 ADR。

---

# 70. Task O — Define File / Directory Blueprint

输出最终 repository tree。

细化到足以指导施工：

```text
apps/web/src/...
apps/api/app/...
docs/...
tests/...
```

说明每个主要目录职责。

这一轮不要为了形式创造几十个空目录。

---

# 71. Task P — Refine M0.1–M0.7

将七个 checkpoint 转化成真正 execution contract。

每一个必须包含：

### Scope

这一 checkpoint 唯一应该完成什么。

### Inputs

依赖哪些前置产物。

### Files / areas allowed to change

预期修改区域。

### Required implementation

必须实现的内容。

### Required tests

必须新增和运行的测试。

### Commands

Agent 完成阶段后必须执行什么。

例如：

```text
lint
typecheck
unit
integration
e2e where applicable
build
migration checks
```

### Acceptance criteria

明确可机械判断。

### Explicit non-goals

禁止“顺手”完成的事项。

### Exit report

下一轮 Agent 应汇报：

* files changed；
* tests；
* commands；
* known limitations；
* deferred issues。

---

# 72. Task Q — Define Agent Working Rules

给下一轮 coding agents 制定纪律。

至少包括：

1. 每个 checkpoint 开始前阅读架构文档；
2. 不擅自改变 frozen invariants；
3. 不自动开始下一 checkpoint；
4. 不扩张 scope；
5. 每次 mutation 前理解现有代码；
6. 测试随实现提交；
7. migration 不手工绕过；
8. 不关闭 type checker；
9. 不以 `any` 逃避 TypeScript contract；
10. 不吞 exception；
11. 不用 TODO 代替核心 invariant；
12. 不使用 fake implementation 伪造测试成功；
13. 不删除 failing test 来获得 green；
14. 不为了“未来需要”增加基础设施；
15. 发现架构冲突时停止该局部实现并报告。

---

# 73. Task R — Define Git Strategy

给出适合 M0 的 commit discipline。

避免：

```text
initial implementation
```

式巨大提交。

建议按：

* foundation；
* migration；
* domain；
* API；
* selection engine；
* rendering；
* alignment；
* visualization；
* hardening；

组织。

不要要求为了 Git 美观切成毫无意义的微提交。

---

# 74. Task S — Documentation Blueprint

M0 至少规划：

```text
README.md
ARCHITECTURE.md
MILESTONES.md
docs/adr/
docs/api/
docs/testing/
```

README 最终应回答：

* project purpose；
* current milestone；
* prerequisites；
* setup；
* database；
* migration；
* backend run；
* frontend run；
* tests；
* lint；
* typecheck；
* build；
* limitations。

---

# 75. Task T — Build a Decision Register

预实现结束时输出：

## Frozen Decisions

已经足够确定，不需要 coding agent 再讨论。

## Deferred Decisions

明确放到 M1/M2 或以后。

## Open Decisions

M0 编码前仍必须选择。

每个 Open Decision：

```text
question
options
recommended answer
reason
risk if delayed
```

目标是把 Open Decisions 压到最低。

---

# 76. M0 Definition of Done

最终 M0 必须满足：

1. 可以创建 Project；
2. 可以创建 ParallelDocument；
3. 可以加入任意 BCP-47 TextVersion；
4. EN / DE / FR / ES 可以同时显示；
5. 任意 contiguous text range 可以可靠选中；
6. API/database offsets 对 Unicode code points 正确；
7. 2–N selections 可以组成 AlignmentGroup；
8. 同一 TextVersion 可以贡献多个 spans；
9. Alignment 可以持久化；
10. reload 后完整恢复；
11. Alignment 可以编辑；
12. Alignment 可以删除；
13. hover/click member 可以发现全部 counterparts；
14. selected alignment 有稳定 visualization；
15. backend unit tests green；
16. backend PostgreSQL integration tests green；
17. frontend tests green；
18. Unicode regression tests green；
19. E2E golden path green；
20. clean database 可以 migration to HEAD；
21. frontend production build 成功；
22. typecheck green；
23. lint green；
24. 文档完整。

另有一个 architecture-level release blocker：

> 核心 schema 不得存在任何 EN / DE / FR / ES 专属结构。

---

# 77. 未来阶段边界

完成 M0 后，系统应当已经拥有：

```text
Human → Alignment
```

完整能力。

未来阶段将在同一个结构上增加：

```text
Machine → Candidate Alignment
Human → Accept / Modify
```

随后可以叠加：

```text
Span → Lemma
Span → POS
Span → Morphology
Span → Dependency
Span → Lexeme
Lexeme → Sense
Lexeme → Etymology
Lexeme ↔ Cognate
```

因此 M0 的最大价值是建立稳定的：

```text
Canonical Text
Span
Alignment
Interaction
Persistence
```

基础设施。

未来 NLP layer 必须能接入这一基础，而无需重写核心工作台。

---

# 78. 预实现阶段禁止事项

本轮严禁把“规划”偷偷扩张成完整施工。

除非为验证技术可行性而需要最小 throwaway experiment，否则：

不要：

* 实现正式业务功能；
* 建完整 UI；
* 建 alignment editor；
* 引入 NLP；
* 引入 LLM；
* 接翻译 API；
* 做词典；
* 训练模型；
* 引入复杂 infrastructure；
* 为未来需求写 speculative code。

如果制作 throwaway proof-of-concept：

必须：

1. 明确标为 disposable；
2. 不进入 production architecture；
3. 说明验证了什么假设；
4. 验证完成后不要让它成为隐含依赖。

---

# 79. 预实现最终输出格式

请按以下顺序交付。

# 1. Executive Assessment

简要判断 M0 架构是否可实施。

列出最重要的 5–10 个工程风险。

---

# 2. Repository Assessment

如果有现有 repository，说明现状。

如果没有：

```text
Greenfield repository
```

---

# 3. Architecture Review

逐项：

```text
CONFIRMED
NEEDS REFINEMENT
BLOCKING
```

---

# 4. Final Domain Model

完整实体、关系、constraint 和 lifecycle。

---

# 5. ER Diagram

Mermaid。

---

# 6. Canonical Text & Unicode Specification

作为独立规范给出。

---

# 7. Selection Engine Specification

必须足够详细。

---

# 8. Rendering & Connector Specification

包括 overlap。

---

# 9. API Contract

包括 JSON examples。

---

# 10. Frontend Architecture

包括 state ownership。

---

# 11. Backend Architecture

包括 transaction ownership。

---

# 12. Repository Blueprint

最终目录结构。

---

# 13. Testing Strategy

包括 traceability matrix。

---

# 14. Failure Mode Analysis

覆盖主要风险。

---

# 15. ADR Drafts

至少 ADR-001 至 ADR-008。

---

# 16. Decision Register

Frozen / Deferred / Open。

---

# 17. Refined M0.1–M0.7 Execution Contracts

这是下一轮 Codex 真正施工的依据。

---

# 18. Implementation Order

明确 dependency graph。

解释：

> 为什么必须按这一顺序施工。

---

# 19. Pre-Implementation Exit Checklist

给出一张最终 checklist。

只有所有 blocker 消失后，才能写：

```text
READY FOR M0.1 IMPLEMENTATION
```

如果仍有 blocker：

明确写：

```text
NOT READY FOR IMPLEMENTATION
```

并列出原因。

---

# 80. 决策原则

遇到不确定性时采用以下优先级：

1. correctness；
2. data integrity；
3. future compatibility with linguistic annotation；
4. testability；
5. simplicity；
6. maintainability；
7. developer convenience；
8. performance；
9. visual polish。

M0 不需要提前优化未经测量的问题。

同时，任何简化都不得牺牲：

* Unicode correctness；
* alignment cardinality；
* persistence integrity；
* language neutrality。

---

# 81. 对过度工程化的约束

请主动识别并拒绝：

* speculative abstraction；
* premature distributed architecture；
* unnecessary state libraries；
* generic repositories without value；
* event buses；
* command buses；
* plugin systems；
* microservices；
* graph databases；
* premature virtualization；
* elaborate design systems；
* premature localization infrastructure；
* NLP placeholders masquerading as architecture。

M0 应当小而坚固。

---

# 82. 对“快速 demo”思维的约束

同样禁止以 demo 速度牺牲基础 correctness。

以下方式不可接受：

```text
先用 JS string.length，emoji 以后再修
```

```text
先固定四种语言
```

```text
先做 source-target pair
```

```text
先让 contentEditable 工作
```

```text
先用 SQLite，之后再换 PostgreSQL
```

```text
先在前端算 exact_text
```

```text
先允许修改正文，错位之后再处理
```

这些做法会直接破坏后续 architecture。

---

# 83. 最后的工程判断标准

在结束这一轮时，请问自己：

> 如果下一位 Agent 完全不知道这段对话，只拥有你产出的工程文档，他是否能够在不重新发明 architecture 的前提下正确完成 M0.1，然后继续安全推进至 M0.7？

如果答案是否定的：

继续完善规划。

如果答案为肯定：

才能宣布：

```text
READY FOR M0.1 IMPLEMENTATION
```

你的职责到这里结束。

不要自动开始编码。
