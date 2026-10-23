# P6 回归与验收清单

> 对应方案第 7 节的「最终验收清单」。状态：✅ 通过 / ⏳ 待环境 / ⚠️ 偏差
> 最近更新：2026-10-23

## 一、最终验收清单

| #   | 验收项                                                                                                  | 状态    | 证据 / 说明                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 同一份 `.env.local` + 同一 PostgreSQL 库，新服务能读旧数据登录（密码、user_id、预算、历史会话全部可用） | ⏳      | `user_id` 的 uuid5 已与旧库真实记录逐字节比对通过（`usr_8e520ac15a6b5fce`）；schema 与旧库做过列/约束/索引三组对比；`@node-rs/bcrypt` 直接校验 `$2b$`（cost 12）。**登录与旧数据读取需要 PostgreSQL 启动后实测** |
| 2   | 五类输入行为一致：记账、查预算、查账单、闲聊、设分类预算                                                | ✅      | `packages/agent/src/pipeline.test.ts` 15 个用例（5 类意图 × 正常/超支/校验失败 + 解析失败 + 回复失败）                                                                                                           |
| 3   | 超支走建议分支，`graph_path` 与旧实现完全相同                                                           | ✅      | 单测断言 `parse_intent→write_transaction→check_budget→advice`；另有真实 DeepSeek 冒烟                                                                                                                            |
| 4   | 预算超总额时返回 422 / Agent 回退文案，不写库                                                           | ✅      | API 集成用例 + Agent 的 `write_budget(validation_failed)` 用例                                                                                                                                                   |
| 5   | MCP 四个工具在 Inspector 中可调用，知识库检索返回排序合理                                               | ✅ / ⏳ | BMI、长任务（进度通知）、Tavily 搜索已用 JSON-RPC 实测；`knowledge_search` 为 **P4b 占位**，检索质量待 P4b                                                                                                       |
| 6   | 前端四个页面功能齐全，`localStorage` 登录态在刷新后保留                                                 | ✅ / ⏳ | React 版已实现四页 + 三弹窗 + `cb_token` 持久化；构建与静态托管实测 200。浏览器点击级回归需人工过一遍                                                                                                            |
| 7   | `README.md` 重写为新项目的启动方式                                                                      | ✅      | 见仓库根 `README.md`                                                                                                                                                                                             |

## 二、P6 清理项

| 项                         | 状态 | 说明                                                                                                             |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yaml` 更新 | ✅   | 去掉过时的 `version: "3.5"`；Attu 宿主端口 8000 → **3100**，不再与 API 冲突                                      |
| 过期 TODO                  | ✅   | 清理了 `schemas/common.ts` 中 6.1 的待确认注释（已由 P1 结论取代）                                               |
| 临时文件/缓存              | ✅   | 无 `.cache`、`.tmp-npm`、`node_modules/.pnpm-store` 残留；`.gitignore` 覆盖 `dist/`、`.env.local`、`.cache/`     |
| 文档                       | ✅   | 根 README + `packages/db/README.md` + 本清单                                                                     |
| 构建 / lint / 格式         | ✅   | `pnpm build`、`pnpm lint`、`format:check` 全部通过                                                               |
| 全量测试                   | ⏳   | 非数据库用例通过；30 个集成用例因 **PostgreSQL 未启动**（`ECONNREFUSED 5432`）失败，待 Docker Desktop 启动后重跑 |
| 工作区外残留               | ⚠️   | `D:\PROJECT\e-diot-acl-recovery\`（会话初期修复目录权限的报告与回滚脚本）可手动删除                              |

## 三、待环境恢复后要补跑的命令

```bash
# 1. 启动 Docker Desktop 后再启动基础设施
docker compose up -d postgres

# 2. 数据层/接口/Agent 集成测试（需要一次性临时库）
docker exec cyber-budget-postgres createdb -U postgres cyber_budget_it
docker cp packages/db/migrations/0000_baseline.sql cyber-budget-postgres:/tmp/m.sql
docker exec cyber-budget-postgres psql -U postgres -d cyber_budget_it -f /tmp/m.sql
TEST_DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/cyber_budget_it pnpm test
docker exec cyber-budget-postgres dropdb -U postgres cyber_budget_it

# 3. 旧数据可用性（验收项 1）
pnpm start            # API
pnpm mcp:start        # MCP（可选）
```

验收项 1 的具体做法：用旧库已有用户的 `user_id` 签发一个 access token（payload 与旧版一致：
`sub/username/phone_num/email`，HS256，同一个 `JWT_SECRET_KEY`），然后调用
`GET /api/v1/users/me`、`/chat/dashboard`、`/chat/sessions`、`/chat/transactions`，
确认能读到旧预算、历史流水与会话；再用旧哈希 + 已知密码验证 bcrypt 兼容性。

## 四、已知偏差（需在 PR/交接里注明）

1. **`chat` 端点不检查 `is_active` 的旧问题已修正**（方案 6.5），现在统一返回 403。
2. **MCP `knowledge_search` 暂为占位**，P4b 接入 Milvus 后替换，工具签名不变。
3. **前端页面常驻**（切 Tab 用 `display` 隐藏）而非卸载重建，与旧版 DOM 缓存行为一致。
4. **金额用 BigInt「分」** 而非 decimal.js（方案里允许字符串或 decimal，此为实现选择）。
