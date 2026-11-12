# CyberBudget · TypeScript 重构

智能记账全栈应用的 TypeScript 版本。旧实现（Python + FastAPI + LangGraph + FastMCP）位于
`D:\PROJECT\mcp_tool_sample`，本次重构的完整方案见该目录下 `docs/ts-refactor-plan.md`。

当前进度：**P0 + P1 + P2 + P5 + P3 + P4a + P6（除数据库回归）**已完成。下一步 **P4b（Milvus + RAG sidecar）**。

- P0：工作区 / tsconfig / ESLint + Prettier / 配置加载 / zod 基础 schema / 统一错误模型
- P1：Drizzle 五张表 1:1、baseline 迁移、repository、uuid5 / 预算 merge / 超支判定纯函数
- P2：auth / users / budget / chat 全部端点、JWT、bcrypt 兼容、OpenAPI（`/docs`）
- P5：登录/注册 + 4 个 Tab + 3 个弹窗的 React 19 前端，复用旧 `style.css`，API 同源托管
- P3：6 节点记账 Agent、OpenAI 兼容 LLM 客户端、`graph_path`/`execution_data` 与旧实现逐字一致
- P4a：MCP Server（:8001/mcp，Streamable HTTP）+ BMI / 长任务 / Tavily 搜索 + 两资源一 prompt
- P6：compose 端口与版本清理、过期 TODO 清理、验收清单（见 [docs/acceptance-checklist.md](docs/acceptance-checklist.md)）

## 快速开始

```bash
# 1. 安装依赖（版本由 package.json 的 packageManager 固定为 pnpm 11.28.7）
#    本机已装 pnpm 12 也可以，pnpm 会自动下载并切换到 11.28.7
pnpm install

# 2. 环境变量
cp .env.example .env.local   # 填入真实密钥；.env.local 不入库
#    JWT_SECRET_KEY 必填，缺失时服务启动即报错退出

# 3. 基础设施（PostgreSQL / Milvus / Redis 等）
docker compose up -d postgres

# 4. 数据库结构
pnpm db:baseline   # 已有旧库（表已存在）：只记录迁移基线，不动数据
# pnpm db:migrate  # 全新空库：直接执行迁移

# 5. 构建与验证
pnpm build
pnpm lint
pnpm test

# 6. 启动（单进程：API 同时托管前端）
pnpm build && pnpm start    # http://127.0.0.1:8000

# 或者开发模式（热更新）
pnpm dev:api    # http://127.0.0.1:8000/health
pnpm dev:web    # http://127.0.0.1:5173（/api、/health 代理到 8000）
```

> ℹ️ `docker-compose.yaml` 里 Attu（Milvus 管理界面）已从宿主 8000 改到 **3100**，不再和 API 抢端口；
> 旧的 `version: "3.5"` 字段也已移除（Compose v2 不再需要）。

> ⚠️ **pnpm 版本固定为 11.28.7**（`packageManager` 字段）。全局装的是 pnpm 12 也没关系：
> 在项目目录里执行 `pnpm` 时，它会按 `packageManager` 自动下载并切换到 11.28.7
> （首次需要网络，缓存在 `%LOCALAPPDATA%\pnpm\global\v11`）。
>
> 之所以不直接用 pnpm 12：它在 Windows 上把商店操作锁硬编码到 `/tmp`
> （即 `<当前盘符>:\tmp`），遇到 `D:\` 根目录不可写会直接报
> `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`（见 [pnpm#16390](https://github.com/pnpm/pnpm/issues/16390)）。
> 若要让项目改用 pnpm 12，需先确保 `D:\tmp` 存在且可写，再改 `packageManager` 并重装。
>
> pnpm 的内容寻址商店位置由 pnpm 配置决定（本机为 `D:\.pnpm-store`，可用 `pnpm store path` 查看），
> `node_modules` 通过硬链接引用商店，删除 `node_modules` 不会删除商店里的包。

## 目录结构

```
e-diot/
├─ apps/
│  ├─ api/          Fastify 服务，:8000，托管前端构建产物
│  ├─ mcp/          MCP Server，:8001（P4a 完成；知识库检索 P4b）
│  └─ web/          Vite + React 19 + TS，4 页 + 3 弹窗（P5 完成）
├─ packages/
│  ├─ shared/       配置、错误模型、zod schema、领域类型、uuid5、金额工具（P0）
│  ├─ db/           Drizzle schema + 迁移 + repository + 预算纯函数（P1，见 packages/db/README.md）
│  ├─ agent/        记账 Agent 流水线（P3）
│  └─ inference/    推理 sidecar 的 TS 客户端契约（P4，方案 6.3）
├─ services/
│  └─ inference/    Python 推理 sidecar（P4）
├─ docs/
│  └─ acceptance-checklist.md   P6 验收清单与补跑命令
├─ docker-compose.yaml
└─ .env.example
```

## 常用命令

| 命令                 | 说明                                                           |
| -------------------- | -------------------------------------------------------------- |
| `pnpm build`         | 按依赖拓扑递归构建所有包（`tsc` / `vite`）                     |
| `pnpm typecheck`     | 递归类型检查（需先 `pnpm build` 让 workspace 依赖产出 `dist`） |
| `pnpm lint`          | ESLint 9 flat config（含类型感知规则）                         |
| `pnpm format`        | Prettier 格式化                                                |
| `pnpm test`          | Vitest（直接跑源码，不需要先构建）                             |
| `pnpm test:coverage` | 覆盖率（P1 验收：纯函数 100% 语句/函数/行）                    |
| `pnpm db:generate`   | 改完 schema 后生成迁移 SQL                                     |
| `pnpm db:migrate`    | 对空库执行迁移                                                 |
| `pnpm db:baseline`   | 给已有旧表的库打迁移基线（幂等）                               |
| `pnpm dev:api`       | tsx watch 启动 API                                             |
| `pnpm dev:mcp`       | tsx watch 启动 MCP Server（:8001/mcp）                         |
| `pnpm mcp:start`     | 运行已构建的 MCP Server                                        |
| `pnpm start`         | 运行已构建的 API（`node dist/main.js`）                        |

## P0 已完成的内容

- **pnpm workspace**：`apps/*`、`packages/*`，Node 22+ / pnpm 12 / TypeScript 5.9 strict + `noUncheckedIndexedAccess`。
- **配置加载**（`packages/shared/src/config.ts`）：对齐旧 `backend/config.py` 的全部键名与默认值，
  用 zod 校验并聚合报错；`JWT_SECRET_KEY` 缺失时启动即失败（旧版延迟到首次登录才抛错）。
  环境文件用 Node 原生 `process.loadEnvFile`，优先级：进程环境 > `.env.local` > `.env`。
- **统一错误模型**（`packages/shared/src/errors.ts`）：`AppError` + 稳定错误码表 + HTTP 映射；
  响应体保留旧前端依赖的 `detail` 字符串，并新增 `code` / `issues`；
  覆盖 zod 校验错误与 Fastify 自带 `statusCode` 错误。
- **zod schema**：auth（注册「手机号/邮箱二选一」refine）、budget（重复分类 refine + `validateCategoryBudgets`）、
  chat、intent（对齐旧 `state.py` 的 LLM 结构化输出）、通用金额/月份。
- **API 骨架**（`apps/api`）：Fastify 5 + `fastify-type-provider-zod`、CORS 白名单、统一错误处理、
  `/health`（字段与旧版一致）、SIGINT/SIGTERM 优雅关闭；`fastify.inject` 冒烟测试。
- **Web 骨架**（`apps/web`）：Vite + React 19 最小页面，验证与 API 的连通链路。
- **工具链**：ESLint 9 flat + typescript-eslint 类型感知规则、Prettier、EditorConfig、`.gitignore`、`.env.example`。

## P1 已完成的内容（数据层）

- **Drizzle 五张表**（`packages/db/src/schema/`）：以**旧库实际结构**为准，而不是 SQLAlchemy 模型
  （`transactions.amount` 实际是 `numeric(12,2)`，模型里声明的 Float 从未生效）。
  表结构与模型的全部差异、迁移工作流、集成测试跑法见 [packages/db/README.md](packages/db/README.md)。
- **baseline 迁移**：`packages/db/migrations/0000_*.sql` 已在临时空库上执行成功，并与旧库做过
  「列定义 / 约束 / 索引」三组对比，无实质差异（只剩 `now()` vs `CURRENT_TIMESTAMP`、外键名等等价写法）。
- **已有库接入**：`pnpm db:baseline` 只向 `drizzle.__drizzle_migrations` 写记录，幂等，不执行 DDL。
- **repository**：users / transactions / budgets / chat 的查询封装；`Executor` 类型同时接受连接与事务，
  不复刻旧 `get_db` 的「`async for` + `return` 跳过 commit」模式。
- **纯函数**：`mergeAndValidateBudgets`（MERGE 语义，超支文案与旧实现逐字一致）、
  `isOverBudget` / `computeBudgetStatus`（方案 5.5）、`generateUserId`（RFC 4122 uuid5）。
- **测试**：82 个用例，其中 7 个是连真实 Postgres 的集成测试；纯函数语句 / 函数 / 行覆盖率 100%。
- **金额**：内部统一 BigInt「分」，不引入 decimal.js（理由见 db README）。

## P2 已完成的内容（API + 认证）

| 方法         | 路径                                | 说明                                                           |
| ------------ | ----------------------------------- | -------------------------------------------------------------- |
| POST         | `/api/v1/auth/register`             | 注册（201；手机号/邮箱/用户名冲突→409，`detail` 用「；」拼接） |
| POST         | `/api/v1/auth/login`                | account 含 `@` 走邮箱，否则手机号；密码错→401，禁用→403        |
| POST         | `/api/v1/auth/refresh`              | 只接受 `type=refresh` 的 token                                 |
| GET          | `/api/v1/users/me`                  | 当前用户资料                                                   |
| POST         | `/api/v1/users/set_budget`          | 更新月度总预算                                                 |
| GET/PUT      | `/api/v1/users/llm-config`          | 用户级 LLM 配置（base_url + key；key 只回传是否已配置）        |
| GET/PUT      | `/api/v1/users/settings`            | 相处方式：人格 / 主动程度 / 关怀时间 / 免打扰 / 暂停           |
| GET/POST     | `/api/v1/memories`                  | 记忆列表 / 新增（待确认）                                      |
| POST         | `/api/v1/memories/:id/confirm`      | 确认记忆，之后参与回复                                         |
| PATCH/DELETE | `/api/v1/memories/:id`              | 纠正内容 / 软删除（删除后不再参与任何回复）                    |
| GET          | `/api/v1/memories/:id/basis`        | 查看依据（交易 / 对话 / 手动）                                 |
| POST         | `/api/v1/budget/agent`              | Agent 解析 + MERGE（P2 阶段 Agent 是占位实现）                 |
| POST         | `/api/v1/budget/manual`             | 全量替换；超总额→422，未设总预算→400                           |
| POST         | `/api/v1/chat`                      | 对话 + 会话/消息持久化 + `graph_path` 追踪                     |
| GET          | `/api/v1/chat/sessions`             | 会话列表（按 `updated_at` 倒序）                               |
| GET/DELETE   | `/api/v1/chat/sessions/:session_id` | 会话详情 / 删除（级联消息）                                    |
| GET          | `/api/v1/chat/dashboard`            | 当月总览（UTC 口径、分类百分比、最近 10 条）                   |
| GET          | `/api/v1/chat/transactions`         | 流水（`limit`、`category`）                                    |
| PATCH        | `/api/v1/chat/transactions/:id`     | 更新交易（部分字段；归属校验，非本人→404）                     |
| DELETE       | `/api/v1/chat/transactions/:id`     | 删除交易（归属校验，非本人→404）                               |

- **JWT**：`jose` HS256，payload 为 `sub/username/phone_num/email/exp/iat`（秒）；refresh token 打 `type=refresh` 标记，
  业务接口收到直接 401（方案 5.2）。
- **密码**：`@node-rs/bcrypt`，cost 12，兼容旧库的 `$2b$` 哈希（方案 5.3）。
- **鉴权**：`app.authenticate` 作为 `preHandler`；`currentUser` / `requireActiveUser` 统一检查用户存在与 `is_active`
  （修正旧版 `chat.py` 不检查禁用的问题，方案 6.5）。
- **事务**：手动预算的全量替换在 `db.transaction` 内执行；其余写操作单语句提交，不再有隐式 commit。
- **OpenAPI**：`http://127.0.0.1:8000/docs`（Swagger UI），`/docs/json` 可拿 JSON。
- **测试**：99 个用例，其中 16 个是覆盖上述全部端点的集成测试（注册→登录→刷新→资料→预算→对话→仪表盘→流水→删除→OpenAPI）。

> Agent 目前是 `apps/api/src/plugins/agent.ts` 里的占位实现（只回显），P3 换成真实流水线后替换，
> 路由、前端契约都不变。

## P5 已完成的内容（前端）

`apps/web/src` 结构：

```
api/        client.ts（fetch 封装、token、401 自动登出）、types.ts（响应 DTO）
components/ Toast.tsx、Modal.tsx、Sidebar.tsx（桌面侧栏）、Topbar.tsx（面包屑/在线状态）
pages/      AuthPage / ChatPage / DashboardPage / BudgetPage / TransactionsPage / MemoryPage / ProfilePage
utils/      format.ts（金额千分位、日期、分类 emoji、消息格式化）
tabs.ts     导航元数据（中文标签 + 等宽英文副标签 + 面包屑分组）
style.css   旧 frontend/css/style.css 原样复用 + 个人页样式
theme.css   Cyberpunk 主题层：色板 / 桌面侧栏 / 顶栏 / 网格与辉光 / 组件皮肤
App.tsx     登录态 + 桌面侧栏 / 移动底部导航 + 6 页（页面常驻，切 Tab 不丢对话状态）
```

- **视觉主题（Cyberpunk）**：深海军蓝 `#111827` + 青柠绿 `#C8F169`，内容区网格底纹、
  侧栏扫描线与径向辉光、等宽字体小标签；登录页为深色赛博入口。
- **桌面布局（≥1024px）**：236px 深色侧栏（6 个入口 + 用户/退出/状态）+ 顶栏面包屑与 `ONLINE`
  状态 + 内容区最大 1120px 网格卡片；聊天页会话栏常驻。
- **移动布局（<1024px）**：沿用单列 + 底部 5 Tab（深色底 + 青柠高亮），会话栏可折叠。
- **页面布局（以参考 HTML 为准）**：所有页面统一 `page-head`（eyebrow/标题/描述/右侧状态）+ 12 栅格卡片：
  - 总览：总支出卡 + 记录规律 + 分类分布 + 近 7 日柱状 + 最近交易 + 规则建议；
  - 账单：支出/收入/结余统计条 + 搜索与分类筛选 + 按日分组 + 单笔展开明细；
  - 预算：月总预算/已支出/分类额度三格 + 分段额度条 + 分类进度列表（三态）；
  - AI 助手：对话卡片（左）+ 会话/快捷输入/状态 rail（右）；
  - 我的：账户信息（5 栏）+ LLM 配置（7 栏）。

- **登录/注册**：token 存 `localStorage.cb_token`，刷新后自动用 `/users/me` 恢复登录态。
- **对话 Tab**：会话侧栏（新建/切换/删除）、欢迎页 + 5 个建议问句、消息流（头像/气泡/`msg-trace` 意图标签）、
  回车发送 / Shift+Enter 换行、打字指示器、侧栏折叠。
- **总览 Tab**：4 张汇总卡（总预算/收入/支出/剩余 + 使用百分比）、分类支出进度条（>80% 警告、>100% 超支色）、
  最近 5 笔交易。
- **预算 Tab**：总预算卡（已分配/剩余）+ 3 个弹窗（AI 自然语言分配 / 手动多行分配 / 设定总预算），提交后自动刷新。
- **账单 Tab**：分类筛选 chips、交易列表（金额正负色、备注、时间）。
- **我的 Tab**：账户信息（user_id/手机号/邮箱/预算/注册时间/状态）+ 用户级 LLM 配置
  （`base_url` + `api_key`，保存后下一次对话即生效；密钥只落库、不回传，清除后回落到全局 `LLM_*`）。
- **相处方式（P0-2）**：4 档人格（潜水/i 人/搭子/话痨）只影响回复语气与长度，不影响判断标准；
  主动程度、每日关怀时间、免打扰与暂停持久化到 `user_settings`，对话时注入 persona 提示词。
- **对话上下文（P0-1）**：`/chat` 会读取同会话最近 12 条消息，Agent 侧按 8 条 / 1800 字符预算截断，
  拼入意图解析与回复 prompt；超出预算时优先保留最新消息。
- **记忆 Tab（P0-3）**：PostgreSQL `memories` 表（类型/来源/状态/置信度），新增即「待确认」，
  确认后按 `边界 > 目标 > 偏好 > 习惯` 取前 8 条注入回复 prompt（1200 字符预算）；
  支持查看依据、纠正、软删除；存储决策见 [docs/memory-storage-decision.md](docs/memory-storage-decision.md)。
- **数据联动**：对话里出现「花了/赚了/买了/预算/分配」时，其余三个 Tab 的数据失效并在下次切换时刷新。
- **同源托管**：`apps/api` 注册 `@fastify/static`，`apps/web/dist` 存在时 `GET /` 直接返回前端；缺失时跳过，
  只跑 API 或测试不受影响。
- **测试**：新增前端纯函数单测（消息转义/格式化、金额、日期、emoji）；全仓 104 个用例。

## 决策记录

1. **`transactions.amount`**：已对旧库执行 `\d transactions` 确认，实际是 `numeric(12,2)`
   （`budgets.monthly_limit`、`users.monthly_budget` 同为 numeric）。**不需要数据迁移**，
   TS 侧直接按 `numeric(12,2)` 建模。若有环境是用 `create_all` 建出的 `double precision`，
   可用 db README 里的 SQL 一次性转换。
2. **RAG**：确定走 **Python sidecar**。`services/inference` 只暴露 `/embed`（dense + sparse）与
   `/rerank` 两个端点，Milvus 混合检索编排、结果格式化都留在 TS；不采用纯 TS（会丢 sparse 召回与 rerank）。
3. **前端**：React 19（P0 已搭 Vite 骨架），迁入 4 个视图 + 3 个弹窗。
4. **阶段顺序已调整**：`P2（API）→ P5（前端）→ P3（Agent）→ P4（MCP/RAG）`。
   因为 P5 提前，P2 里 chat 相关端点先接一个**可替换的 Agent 端口**（`apps/api/src/plugins/agent.ts`），
   默认返回占位文案；P3 已换成真正的流水线，前端无改动。
5. **LLM 客户端**：用原生 `fetch` 实现 OpenAI 兼容调用，没有引入 `openai` npm SDK（少一个依赖、
   超时与错误处理更可控）。需要换 SDK 时只改 `packages/agent/src/llm/client.ts`。
6. **Milvus/RAG 后置**：P4 拆成 P4a（MCP 全部工具，`knowledge_search` 返回占位提示）与
   P4b（Milvus + 推理 sidecar）。这样 MCP 可以独立交付，不依赖 Milvus 那套容器。

## P3 已完成的内容（Agent）

`packages/agent/src`：

```
llm/client.ts    OpenAI 兼容客户端（原生 fetch，注入式；超时 + 非 2xx 抛错）
llm/intent.ts    意图解析：JSON mode + 去 markdown 围栏 + 空对象归一 + zod 校验
prompts.ts       旧 backend/llm/prompts.py 原样搬运（含全部兜底文案）
nodes.ts         6 个节点（parseIntent / writeTransaction / checkBudget / writeBudget / generateResponse / advice）
pipeline.ts      类型化执行器 + deriveGraphPath + buildExecutionData
```

- **路由**：与旧 `graph.py` 一致 —— 记账 → `write_transaction → check_budget → (advice | generate_response)`；
  预算分配 → `write_budget → generate_response`；其余（含解析失败）→ `check_budget → (advice | generate_response)`。
- **`graph_path`**：逐字复刻 `_derive_graph_path`，包括 `write_budget(validation_failed)`、`parse_intent→error`
  这些特殊路径，以及「预算分配不经过 check_budget」的细节。
- **`execution_data`**：字段名与旧 `_build_execution_data` 完全一致（`transaction` / `budget_allocations` /
  `budget_status` / `budget_validation_error`），直接写入 `chat_messages.execution_data`。
- **金额与超支**：复用 P1 的 `isOverBudget`（方案 5.5）与 `mergeAndValidateBudgets`（MERGE + 总额校验），
  金额仍走 BigInt「分」。
- **失败兜底**：解析失败 `FALLBACK_PARSE_ERROR`、回复失败 `FALLBACK_RESPONSE_ERROR`、超支建议失败
  `FALLBACK_OVERSPEND_TEMPLATE`、未设总预算 `FALLBACK_NO_TOTAL_BUDGET`，文案与旧版逐字一致。
- **API 接入**：`apps/api/src/plugins/agent.ts` 用真实流水线替换占位实现；`buildServer(config, { agent })`
  允许测试注入假 Agent（P2 的接口测试继续用占位实现，断言不变）。
- **测试**：15 个 Agent 用例（5 类意图 × 正常/超支/校验失败 + 解析失败 + 回复失败 + graph_path 单测），
  全仓 **119 个用例**；另外用临时库 + 真实 DeepSeek 做了一次端到端冒烟（返回了自然的记账回复）。

## P4a 已完成的内容（MCP Server，不含 Milvus）

`apps/mcp/src`：

```
server.ts        McpServer：4 个工具 + 2 个资源 + 1 个 prompt
http.ts          Streamable HTTP 传输（/mcp，有状态会话 + JSON 响应）
tavily.ts        Tavily 搜索 / 深度研究（fetch + sleep 可注入，便于单测）
main.ts          入口：127.0.0.1:8001（MCP_HOST / MCP_PORT）
```

| 能力                        | 说明                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `calculate_bmi`             | 文案与旧实现一致：`BMI 指数为: 22.86，属于【正常】区间。`                             |
| `long_running_task`         | 每步 500ms，`notifications/progress` + `notifications/message`（已声明 logging 能力） |
| `web_search`                | Tavily search / research；research 保留 3s × 30 次轮询上限与全部文案                  |
| `knowledge_search`          | **P4b 占位**：返回「知识库检索尚未接入」提示，签名与旧版一致，客户端不用改            |
| `system://status`           | `{"status":"online","version":"1.0.0","services":["database","cache"]}`               |
| `users://{user_id}/profile` | `用户信息: ID=…, 角色=管理员, 状态=活跃`                                              |
| `code_review_prompt`        | 提示词模板与旧版一致                                                                  |

- **传输**：`/mcp` Streamable HTTP，`initialize` 返回 `mcp-session-id`，后续请求复用会话；
  `enableJsonResponse` 让 POST 直接返回 JSON（curl / Inspector 都方便）。
- **删除项**：旧 `_get_tushare_data`（注册成 tool 但永远返回 None）已按方案移除。
- **验证**：MCP 单测 15 个（工具/资源/prompt + Tavily 参数与轮询）；并用 curl 走完整 JSON-RPC 流程
  （initialize → tools/list → tools/call → resources/read → prompts/get），
  另用真实 Tavily key 验证了 `web_search` 的返回格式。

```bash
pnpm mcp:start          # 或 pnpm --filter @cyberbudget/mcp start
# 端点：http://127.0.0.1:8001/mcp
```

## 下一步：P4b（Milvus + 推理 sidecar）

Milvus 相关事项按约定后置：

- `services/inference`：Python sidecar（`POST /embed` 返回 dense+sparse、`POST /rerank` 返回分数），复用旧 `models/`；
- `packages/inference`：sidecar 客户端（契约已在 P0 定好）；
- Milvus 混合检索（`WeightedRanker(0.7, 0.3)`）+ rerank，替换 `knowledge_search` 占位；
- `knowledge_search` 输出保持旧版人类可读格式（emoji 标题、`─` 分隔线、`[n] score`、内容截断 200 字）。

## P6 已完成的内容（回归与收尾）

完整清单见 [docs/acceptance-checklist.md](docs/acceptance-checklist.md)（含每项的通过状态与补跑命令）。

- **compose 清理**：删掉过时的 `version: "3.5"`；Attu 宿主端口 8000 → **3100**，API 不再被抢端口。
- **文档**：README 覆盖启动/命令/阶段/决策；`packages/db/README.md` 记录表结构差异与迁移流程；
  `docs/acceptance-checklist.md` 记录 7 项最终验收的状态。
- **代码清理**：移除过期 TODO（6.1 已由 P1 结论取代）、确认无临时缓存残留。
- **回归结果**：`pnpm build` / `pnpm lint` / `format:check` 全绿；Agent/前端/MCP 单测通过；
  30 个依赖数据库的集成用例因本机 PostgreSQL 未启动（`ECONNREFUSED 5432`）暂未跑通，
  启动 Docker Desktop 后按清单第三节补跑即可。
- **已知偏差**：见清单第四节（`chat` 统一检查 `is_active`、`knowledge_search` 为 P4b 占位、金额用 BigInt 分）。

## 与旧项目的对应关系

| 旧文件                                 | 新位置                                                     | 阶段              |
| -------------------------------------- | ---------------------------------------------------------- | ----------------- |
| `backend/config.py`                    | `packages/shared/src/config.ts` + `apps/api/src/plugins/*` | P0 配置 / P2 插件 |
| `backend/schemas/auth.py`、`budget.py` | `packages/shared/src/schemas/*.ts`                         | P0                |
| `backend/agent/state.py`               | `packages/shared/src/schemas/intent.ts`                    | P0                |
| `backend/models/*.py`                  | `packages/db/src/schema/*.ts`                              | P1                |
| `auth.py` 的 `generate_user_id`        | `packages/shared/src/auth/user-id.ts`                      | P1                |
| `models/budget.py` 的 merge 校验       | `packages/db/src/services/budget-merge.ts`                 | P1                |
| `backend/api/v1/*`                     | `apps/api/src/routes/*.ts`                                 | P2                |
| `backend/agent/*`、`backend/llm/*`     | `packages/agent/src/**`                                    | P3                |
| `backend/mcp/server.py`                | `apps/mcp/src/**` + `services/inference`                   | P4a / P4b         |
| `frontend/*`                           | `apps/web/src/**`                                          | P5                |

行为契约（`user_id` 生成、JWT、bcrypt、预算两套语义、超支判定、UTC 口径、`graph_path` 格式等）
以方案第 5 节为准，移植时逐条对照。

## 环境变量

见 [`.env.example`](./.env.example)。关键点：

- `JWT_SECRET_KEY` **必填**，启动即校验；
- `DATABASE_URL` 存在时覆盖 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`；
- `MILVUS_URI` 才是检索实际使用的连接串（旧版 `MILVUS_HOST/PORT` 无消费者，故不再保留）；
- `EMBEDDING_MODEL_PATH` / `RERANKER_MODEL_PATH` 仅 sidecar 使用，`models/` 不复制；
- `TEST_DATABASE_URL` 仅数据层集成测试用，未设置时该组测试自动跳过（见 db README）。
