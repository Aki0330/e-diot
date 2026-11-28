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
- `hotfix/<name>`：线上紧急修复（同样必须走 PR；owner 可加急 review，但禁止直接 push `main`）

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
- **任何角色（包括 owner）都不得直接 push `main`；hotfix 也必须走 PR，可加急 review，但不可跳过 CI 与审核**

## 强制生效条件

仓库里的 PR 模板、CODEOWNERS、CI 只能“提出要求”，**不能阻止有人直接 push `main`**。要做到“所有分支合并都必须走 PR/MR 审核”，必须在 GitHub 开启 `main` 分支保护：

- Require a pull request before merging
- Required approvals ≥ 1，并开启 Require review from Code Owners
- Require status checks：`CI / verify`
- Block force pushes、Restrict deletions
- Include administrators（owner 也不例外）
- 合并方式只保留 Squash

完整配置见 [docs/merge-process.md](docs/merge-process.md)。开启保护后，任何分支（feature/fix/docs/chore/hotfix）都无法绕过 PR 直接进入 `main`。

> 单 owner 仓库注意：开启“至少 1 个 approval”后，owner 无法批准自己的 PR。需要新增一位 maintainer，或在 ruleset 中给 owner 配置 bypass；否则只能临时关闭保护，反而破坏流程。

## 现有分支

历史分支（如 `feat/frontend-ui-polish-2`、`feature/local-deploy`）也需要补开 PR，由 owner 审核后合并；不再直接 push `main`。
