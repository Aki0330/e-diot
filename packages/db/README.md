# @cyberbudget/db · 数据层

对应旧项目 `backend/models/*.py` + `backend/config.py` 的引擎部分。P1 已完成。

## 结构

```
src/
├─ schema/            Drizzle 表定义（1:1 对齐旧库实际结构）
│  ├─ users.ts
│  ├─ transactions.ts
│  ├─ budgets.ts
│  └─ chat.ts          chat_sessions / chat_messages
├─ client.ts           pg Pool + drizzle 实例 + Executor 类型（连接或事务）
├─ repositories/       users / transactions / budgets / chat 的查询封装
└─ services/
   ├─ budget-merge.ts  MERGE 语义纯函数 + 写库回调
   └─ budget-status.ts 超支判定与 BudgetStatus 组装
migrations/            drizzle-kit 生成的 baseline（0000_*.sql + meta）
scripts/baseline.mjs   给已存在旧表的数据库打迁移基线
```

## 表结构以「实际库」为准，不是 SQLAlchemy 模型

用 `\d` 对照过真实库后确认：旧库同时存在 `init_db.sql` 建的表和 SQLAlchemy `create_all` 建的表，
两者与模型声明并不一致。Drizzle schema 按实际库写：

| 项                                       | 实际库                              | 旧模型/SQL 文件                                                |
| ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `transactions.amount`                    | `numeric(12,2)`                     | 模型是 `Float`，SQL 文件是 numeric（模型那套从未生效）         |
| `budgets.monthly_limit`                  | `numeric(12,2)`                     | 模型写的是 `Numeric(10,2)`                                     |
| `users.currency` / `users.last_login_at` | 存在                                | 模型里没有（只有 SQL 文件有 currency）                         |
| `users.username` 唯一性                  | **无唯一约束**（应用层查重）        | 模型写了 `unique=True`                                         |
| `chat_messages.message_id`               | `serial`（integer）                 | `init_db.sql` 写的是 `BIGSERIAL`（该表实际是 create_all 建的） |
| `chat_sessions` 索引                     | `ix_chat_sessions_user_id`          | `init_db.sql` 是 `idx_sessions_user_time`                      |
| 列注释                                   | 有（来自 create_all 的 `comment=`） | —                                                              |

迁移文件与旧库的剩余差异都是等价写法，校验时已确认「列定义 / 约束 / 索引」三组对比无实质差异：

- 默认值 `now()` vs `CURRENT_TIMESTAMP`、`'0'::numeric` vs `0`；
- 外键约束名不同（drizzle 生成 `*_fk`，旧库是 Postgres 自动命名 `*_fkey`）；
- `idx_transactions_user_time` 多了显式 `NULLS LAST`；
- 旧库有 `pgcrypto` 扩展（旧 SQL 里建的，新代码用 `node:crypto` 生成 uuid5，不再需要）。

## 迁移工作流

```bash
# 1. 改了 schema 之后生成迁移
pnpm db:generate

# 2a. 空库：直接迁移
pnpm db:migrate

# 2b. 已有旧数据的库：先打基线（只写 drizzle.__drizzle_migrations，不执行 DDL）
pnpm db:baseline
```

`db:baseline` 会检查 `public.transactions` 是否存在，然后按 `migrations/meta/_journal.json`
把迁移记录写入 `drizzle.__drizzle_migrations`。重复执行是幂等的。

## 集成测试

`src/repositories/repositories.test.ts` 需要 `TEST_DATABASE_URL` 指向**已应用迁移的空库**；
未设置时整组跳过（所以 `pnpm test` 在没数据库的机器上也全绿）。

```bash
docker exec cyber-budget-postgres createdb -U postgres cyber_budget_it
docker cp packages/db/migrations/0000_*.sql cyber-budget-postgres:/tmp/m.sql
docker exec cyber-budget-postgres psql -U postgres -d cyber_budget_it -f /tmp/m.sql
TEST_DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/cyber_budget_it pnpm test
```

> Windows 上别用 PowerShell 管道把 SQL 灌进 `psql`（中文默认值 `'新对话'` 会被编码搞坏），用 `docker cp`。

## 金额策略

`numeric(12,2)` 的最小单位是「分」，所以 `@cyberbudget/shared/money.ts` 内部统一用 **BigInt 分**：

- `parseCents("120.50")` → `12050n`，超过两位小数按四舍五入（与 Postgres numeric 一致）；
- 求和/比较全整数运算，不存在 `0.1 + 0.2` 误差；
- 出口 `formatCents()` / `toMoneyNumber()`，API 仍然是 JSON number。

方案里提到的 decimal.js 没有采用：金额域只有两位小数，BigInt 分足够且无依赖
（decimal.js 的默认导出在当前 NodeNext + TS 5.9 组合下类型解析异常）。

## 与旧实现的对应

| 旧代码                                                        | 新位置                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `models/user.py` / `transaction.py` / `budget.py` / `chat.py` | `src/schema/*.ts`                                                    |
| `config.py` 的 `_get_engine` / `get_db`                       | `src/client.ts`（显式连接池与事务，不复刻工作区模式）                |
| `models/budget.py` 的 `merge_and_validate_budgets`            | `src/services/budget-merge.ts`                                       |
| 方案 5.5 的超支判定                                           | `src/services/budget-status.ts`                                      |
| `auth.py` 的 `generate_user_id`                               | `packages/shared/src/auth/user-id.ts`（uuid5，已用旧库真实记录验证） |
