# E-diot 功能测试报告

> 日期：2026-11-19　测试人：绫波 無夢　环境：本机 Windows 10 + Docker Desktop 29.9.3 + WSL 2.9.13
> 被测版本：`feature/local-deploy`（基于上游 `main` 36f9610）；队友分支 `feat/frontend-ui-polish-2` 单独跑过

## 1. 结论

- **主流程可用**：注册 / 登录 / 一句话记账 / 预算 / 总览 / 账单 / 记忆 / 设置 全部实测通过。
- **自动化测试全绿**：218 / 218，其中 50 个是连真实 Docker PostgreSQL 的集成用例。
- **队友前端分支可合并**：`feat/frontend-ui-polish-2` 构建通过、188 测试全绿，前端观感明显提升。
- **发现 2 个体验问题**（不阻塞演示）：用户级 LLM 配置缺 `base_url` 时会静默回落；未设总预算时 `/budget/agent` 静默返回空分类。

## 2. 环境

| 项          | 值                                                                  |
| ----------- | ------------------------------------------------------------------- |
| OS          | Windows 10 22H2（19045.6456）                                       |
| Docker      | 29.9.3；容器 `cyber-budget-postgres`（postgres:16-alpine，healthy） |
| WSL         | 2.9.13.0，内核 6.18.40.1-1                                          |
| Node / pnpm | v24.21.0 / 11.28.7                                                  |
| 数据库      | `cyber_budget_db`（业务）、`cyber_budget_it`（集成测试）            |
| API / Web   | <http://127.0.0.1:8000>（Fastify 同源托管）                         |

## 3. 自动化测试

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgrespassword@127.0.0.1:5432/cyber_budget_it'
pnpm test
```

结果：**21 个测试文件 / 218 个用例全部通过，0 跳过**。

覆盖：金额与预算纯函数、uuid5、配置校验、zod schema、Agent 5 类意图、MCP 工具、前端格式化、API 全部端点（注册→登录→刷新→预算→对话→仪表盘→流水→删除→OpenAPI）。

## 4. 手工功能实测（真实 Docker 库）

| 功能              | 操作                                                    | 结果                                                                                                        |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 注册 / 登录       | 手机号注册 → 登录 → `/users/me`                         | ✅ 201 / 200，JWT 正常                                                                                      |
| 自然语言记账      | 对话「今天打车花了 28 元」                              | ✅ 回复自然，`graph_path=parse_intent→write_transaction→check_budget→generate_response`，库里新增 28 元交通 |
| 一句话多笔        | 对话「今天午饭花了 38，下午打车 26」                    | ✅ 两笔一起记，餐饮 38 + 交通 26                                                                            |
| 总预算            | `POST /users/set_budget` 6000                           | ✅ 返回 6000                                                                                                |
| 分类预算（Agent） | `POST /budget/agent`「餐饮 2000，交通 500，购物 1000」  | ✅ MERGE 写入 3 类，合计 3500，剩余 2500                                                                    |
| 分类预算（手动）  | `POST /budget/manual`                                   | ✅ 全量替换，超总额返回 422（自动化用例覆盖）                                                               |
| 总览              | `GET /chat/dashboard`                                   | ✅ 支出 / 收入 / 分类 / 最近交易正确                                                                        |
| 账单              | 新增支出 / 收入、列表、筛选                             | ✅ 金额、分类、时间正确；更新 / 删除由集成用例覆盖                                                          |
| 记忆              | 新增 → 确认 → 查依据 → 纠正 → 删除                      | ✅ pending → active → soft delete                                                                           |
| 相处设置          | 人格 / 主动程度 / 关怀时间 / 免打扰                     | ✅ 读写正常                                                                                                 |
| 前端桌面端        | 登录、对话、总览、预算、账单、我的                      | ✅ 6 页渲染正常（截图见 `screenshots/`）                                                                    |
| 移动端 `#/m`      | 对话、总览、账单、我的                                  | ✅ 4 Tab 正常，底部导航可用                                                                                 |
| AI 对话质量       | 查预算「这个月餐饮预算还剩多少？」                      | ✅ 回答「还剩 1952.1 元（预算 2000，已花 47.9）」，数字正确                                                 |
| 队友分支          | `feat/frontend-ui-polish-2`：`pnpm build` + `pnpm test` | ✅ 构建通过，218/218 通过；新登录页、侧栏、移动端均已生效                                                   |

## 5. 发现的问题

### P2-1 用户级 LLM 配置缺 `base_url` 时静默回落

- **现象**：在「我的 → LLM 配置」只填 API Key、`base_url` 留空，保存成功；对话仍报「未配置 LLM_API_KEY」。
- **原因**：`pickLlmSettings` 只在 `base_url` 与 `key` **同时非空**时采用用户配置，否则整体回落到全局（全局 Key 为空）。
- **影响**：用户以为已配置，实际没生效；演示时容易卡住。
- **建议**（二选一）：前端在 `base_url` 留空时自动填 `https://api.deepseek.com`；或后端改为逐字段回退（Key 非空即用用户 Key + 全局 base_url）。
- **临时处理**：已把测试账号的 `llm_base_url` 补成 DeepSeek 地址，实测对话恢复正常。

### P2-2 未设总预算时 `/budget/agent` 静默返回空分类

- **现象**：未设总预算时调用 `POST /budget/agent`「餐饮 2000，交通 500」，返回 200，`categories=[]`、`total_budget=0`，前端没有任何提示。
- **原因**：该路由没有像 `/budget/manual` 那样调用 `requireTotalBudget`，Agent 的校验失败被忽略，直接返回当前空预算。
- **影响**：用户以为分配成功，实际没写库。
- **建议**：复用 `requireTotalBudget`，返回 400 `BUDGET_TOTAL_NOT_SET`；或在响应里带 warning 让前端提示「请先设总预算」。

## 6. 未覆盖 / 未实测

| 项                  | 原因                                | 复跑方式                                                |
| ------------------- | ----------------------------------- | ------------------------------------------------------- |
| MCP Server 工具     | 本次未启动 8001                     | `pnpm mcp:start`，再用 Inspector / curl 走 JSON-RPC     |
| 主动关怀定时消息    | 依赖到点调度（care_time 后 2 小时） | 调 `user_settings.care_time` 到当前时间前，等调度器 60s |
| Milvus / RAG（P4b） | 未接入，`knowledge_search` 为占位   | 需先起 milvus/etcd/minio                                |
| 真机移动端          | 只有 Chromium 模拟 390×844          | 手机浏览器打开 `http://<局域网IP>:8000/#/m`             |
| 多用户并发 / 压测   | 未做                                | 可用 k6 / autocannon 对 `/health`、`/chat` 压测         |

## 7. 复跑命令

```powershell
# 1. 确认依赖服务
docker compose -f C:\Users\linhanyu\Desktop\cyberbudget\e-diot-main\docker-compose.yaml ps

# 2. 全量测试（含数据库集成）
$env:PATH = "C:\Users\linhanyu\Desktop\cyberbudget\_tools;C:\Users\linhanyu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:PATH"
$env:TEST_DATABASE_URL='postgresql://postgres:postgrespassword@127.0.0.1:5432/cyber_budget_it'
cd C:\Users\linhanyu\Desktop\cyberbudget\e-diot-main
pnpm test

# 3. 构建
pnpm build

# 4. 启动
pnpm start
```
