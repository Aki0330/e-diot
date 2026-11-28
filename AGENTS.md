# AGENTS.md — 编码规范（CyberBudget）

> 适用于所有在本仓库工作的 agent / 协作者。新增或修改规则请改这里，并在提交说明里写原因。

## 硬性流程：branch → coding → review → testing → PR

所有改动必须通过 PR/MR 进入 `main`；**禁止直接 push `main`**，**禁止贡献者自行合并 PR**。合并权限只属于 maintainer / owner。

0. **Branch**：从最新 `main` 拉分支（`feat/`、`fix/`、`chore/`、`docs/`），不要在主分支开发。
1. **Coding**：先读相关代码与测试，确认接口契约、数据口径与错误语义；实现最小闭环。
2. **Review**：按 `.claude/skills/pr-reviewer/SKILL.md` 的七个维度自查一遍。
   - 目标是**规范性与健壮性**；一次只看这次改动的风险面，**不做过度 review**（不主动发起无关重构）。
   - 每处修改都要能回答：会影响谁？有没有更小的改法？
3. **Testing**：按 `.claude/skills/test-forge/SKILL.md` 补测试并运行。
   - 先跑相关用例，再跑全量 `pnpm test`；
   - 失败必须修到绿；不允许 skip / 吞异常 / 改断言绕过。
   - 需要外部环境（PostgreSQL / Docker）时，明确写出「未验证项 + 复跑命令」。
4. **PR**：推送分支并按 `.github/pull_request_template.md` 开 PR，附验证结果、风险与截图；
   CI（format / build / typecheck / lint / test）全绿、CODEOWNERS 审核通过后，由 maintainer / owner 合并。

流程细节见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/merge-process.md](docs/merge-process.md)。

## 第一性原则

**在实现完整功能的前提下，尽可能少改代码，尽量不影响其他功能代码。**

- 优先复用现有函数、类型、错误码，不新增平行实现；
- 只改必须改的文件；顺手重构拆成独立提交；
- 不改公共接口形状；必须改时同步调用方与测试；
- 不引入新依赖，除非现有依赖无法完成且说明理由；
- 迁移类工作以「旧行为逐字一致」为验收标准（见方案第 5 节）。

## 项目约定

- pnpm 11 / Node ≥ 22.18 / TypeScript strict + `noUncheckedIndexedAccess`。
- 提交前跑：`pnpm lint`、`pnpm build`、`pnpm format:check`；涉及 DB 时用 `TEST_DATABASE_URL` 跑集成测试。
- 错误响应保留 `detail` 字符串（旧前端依赖），新增 `code`。
- 金额一律 BigInt「分」（`packages/shared/src/money.ts`），不碰浮点。
- 行为契约以旧项目 `docs/ts-refactor-plan.md` 第 5 节为准。
- 数据库 schema 以**实际库**为准（`numeric(12,2)`），不是 SQLAlchemy 模型。
