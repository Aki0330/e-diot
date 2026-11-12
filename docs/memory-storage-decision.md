# 长期记忆：现在是否先上 Milvus？

> 结论（2026-11-12）：**不需要**。记忆 v1 用 PostgreSQL；Milvus 继续留给 P4b 的文档知识库（`knowledge_search`）。
> 未来需要语义召回时，优先评估 **pgvector**（同一个库），规模或隔离需求出现后再评估 Milvus。

## 一、为什么现在不需要

| 维度     | 现状                                                            | 结论               |
| -------- | --------------------------------------------------------------- | ------------------ |
| 数据量   | 每个用户几十到几百条记忆；全表按 `user_id` 过滤是毫秒级         | 不需要 ANN 索引    |
| 检索方式 | v1 只需「状态/类型/时间/重要性筛选 + 关键词」                   | 关系型查询足够     |
| 一致性   | 记忆要可查看来源、可纠正、可删除，删除后立即不参与判断          | 事务比向量库更直接 |
| 运维成本 | Milvus 需要 etcd + MinIO + milvus（约 4–6GB），P4b 已因环境后置 | 现在引入会阻塞 P0  |
| 延迟     | sidecar 首次加载 30–60s，单条 embedding 50–200ms                | P0 没有这部分预算  |
| 验收标准 | P0 只要求「新增/确认/纠正/删除 + 注入生效」                     | 与语义召回无关     |

## 二、Memory v1 的存储方案（Postgres）

建议表：

```sql
memories (
  id            uuid primary key,
  user_id       varchar(64) references users(user_id) on delete cascade,
  type          varchar(20),   -- preference | goal | habit | boundary
  content       text,
  source        varchar(20),   -- conversation | transaction | manual
  source_ref    text,          -- 会话 id / 交易 id / 消息 id，用于「查看依据」
  status        varchar(20),   -- pending | active | deleted
  confidence    numeric(3,2),
  created_at    timestamptz,
  updated_at    timestamptz,
  deleted_at    timestamptz
)
```

索引：`(user_id, status, updated_at desc)`；如需要关键词检索再加 `pg_trgm` 的 GIN 索引。

检索策略 v1（注入 Agent 前）：

1. 过滤 `status = 'active'`；
2. 类型优先级：boundary > goal > preference > habit；
3. 同优先级按 `updated_at desc`，取 top 8；
4. 关键词命中（`ILIKE`/`pg_trgm`）加权；
5. 按 1200 字符预算截断后拼入 prompt。

## 三、什么时候再评估 Milvus / 向量检索

满足任一条件再启动评估：

- 单用户记忆超过 ~500 条，或全量记忆超过 ~10 万条，且召回质量成为可测问题；
- 需要跨类型/跨用户的语义搜索（例如「记忆 + 知识库」统一检索）；
- pgvector HNSW 在目标数据量下 P95 超过 100ms；
- 需要独立扩缩容、多租户物理隔离或专门的向量运维能力。

演进顺序建议：**Postgres 结构化检索 → pgvector（同库）→ Milvus（独立集群）**。
在 Repository 层抽象 `MemoryStore` 接口，后续替换实现不影响 API 与前端。

## 四、与 P4b 的关系

- P4b（Milvus + 推理 sidecar）服务于**文档知识库**的混合检索，与「用户长期记忆」是两条链路；
- 记忆 v1 不依赖 P4b；P4b 仍可按原计划单独推进；
- 若未来两条链路都要语义检索，再统一评估向量基础设施，避免重复建设。
