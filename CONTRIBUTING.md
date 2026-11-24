# 贡献与合并流程

本仓库托管在 GitHub，使用 **Pull Request（PR）** 发起变更；如果仓库镜像到 GitLab，对应 **Merge Request（MR）**，规则相同。

核心原则：**任何进入 `main` 的改动都必须经过 PR/MR，并由 maintainer / owner 合并。** 贡献者不要直接 push `main`，也不要自行合并自己的 PR。

## 角色

| 角色        | 职责                                                   |
| ----------- | ------------------------------------------------------ |
| Contributor | 从 `main` 拉分支、提交、开 PR、响应 review；不合并 PR  |
| Maintainer  | 审核 PR、确认测试与风险、在门禁通过后合并              |
| Owner       | 维护分支保护、CODEOWNERS、发布与紧急回滚；审批敏感改动 |

当前 owner / maintainer：`@Aki0330`。新增 maintainer 需 owner 在 GitHub 仓库设置中授权。

## 标准流程

1. **同步主干**：`git fetch origin && git switch main && git pull --ff-only`
2. **拉分支**：`git switch -c feat/<short-name>`（或 `fix/`、`chore/`、`docs/`）
3. **开发与自测**：按 [AGENTS.md](AGENTS.md) 完成 coding → review → testing
4. **推送分支**：`git push -u origin <branch>`
5. **开 PR**：使用仓库的 PR 模板，写清变更、验证、风险与截图
6. **CI**：`CI / verify` 必须全绿（format、build、typecheck、lint、test）
7. **Review**：至少 1 位 maintainer 批准；敏感路径需 owner 批准（见 `.github/CODEOWNERS`）
8. **合并**：由 maintainer / owner 执行 **Squash and merge**，合并后删除源分支

## 分支命名

- `feat/<name>`：新功能
- `fix/<name>`：缺陷修复
- `chore/<name>`：工程/依赖/流程
- `docs/<name>`：文档
- `hotfix/<name>`：线上紧急修复（仍需 owner 事后补 PR 记录）

## PR 要求

- 标题使用约定式提交前缀：`feat: ...`、`fix: ...`、`docs: ...`
- 描述包含：变更内容、关联 Issue、验证命令与结果、风险/回滚方式
- UI 变更附桌面 + 移动端截图；接口/DB 变更附迁移与兼容性说明
- 不提交密钥、`.env.local`、本地数据库文件、构建产物
- 不把无关重构混进功能 PR；需要时拆 PR

## 本地门禁

```bash
pnpm format:check
pnpm build
pnpm typecheck
pnpm lint
TEST_DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/cyber_budget_ci pnpm test
```

涉及数据库时，先按 `packages/db/migrations/*.sql` 顺序建测试库；不得跳过失败用例或修改断言绕过。

## 合并规则

- 只允许 **Squash and merge**，保持 `main` 线性、每个 PR 一个提交
- 合并前必须：CI 全绿、至少 1 个 approval、所有对话 resolved、无冲突
- 合并后自动删除源分支；本地同步 `main`
- 禁止 force push `main`、禁止删除 `main`
- 紧急情况下 owner 可临时绕过，但必须在 24 小时内补 PR 记录与复盘

## 现有分支

历史分支（如 `feat/frontend-ui-polish-2`、`feature/local-deploy`）也需要补开 PR，由 owner 审核后合并；不再直接 push `main`。
