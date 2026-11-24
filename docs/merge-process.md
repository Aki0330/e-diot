# 仓库合并流程与分支保护

本文是 [CONTRIBUTING.md](../CONTRIBUTING.md) 的运维补充：GitHub 仓库需要开启哪些保护规则，以及现有分支如何迁移。

## 目标

- `main` 只接受经过 PR 的变更；
- PR 必须通过 `CI / verify`；
- 至少 1 位 maintainer 批准，敏感路径由 owner 批准；
- 只有 maintainer / owner 能合并；
- 合并后 `main` 保持线性（Squash）。

## GitHub 设置（Owner 操作）

进入 **Settings → Rules → Rulesets → New branch ruleset**（或 Branches → Add branch protection rule），目标分支填 `main`，开启：

| 设置                                                             | 值                        |
| ---------------------------------------------------------------- | ------------------------- |
| Require a pull request before merging                            | 开启                      |
| Required approvals                                               | 1                         |
| Dismiss stale pull request approvals when new commits are pushed | 开启                      |
| Require review from Code Owners                                  | 开启                      |
| Require conversation resolution before merging                   | 开启                      |
| Require status checks to pass                                    | 开启，选择 `CI / verify`  |
| Require branches to be up to date before merging                 | 开启                      |
| Block force pushes                                               | 开启                      |
| Restrict deletions                                               | 开启                      |
| Include administrators                                           | 建议开启（owner 也走 PR） |

仓库级合并方式：

- **Settings → General → Pull Requests**：只勾选 **Allow squash merging**；
- 开启 **Automatically delete head branches**；
- 关闭 **Allow auto-merge**（避免绕过人工确认），或仅在 CI 稳定后开启。

## CODEOWNERS

`.github/CODEOWNERS` 将默认审核人设为 `@Aki0330`，并对以下路径强制 owner 审核：

- `apps/api/`（认证、接口）
- `packages/db/`（schema / 迁移）
- `.github/`（CI 与流程本身）

开启 “Require review from Code Owners” 后，这些路径的 PR 没有 owner 批准不能合并。

## 贡献者操作

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c feat/my-change
# 开发、测试
git push -u origin feat/my-change
```

然后在 GitHub 打开：

```text
https://github.com/Aki0330/e-diot/compare/main...feat/my-change?expand=1
```

选择 PR 模板，填写验证结果，等待 CI 与 review。**不要自行合并，也不要直接 push main。**

## 现有分支迁移

以下两个分支已推送但未合并，需要补开 PR：

- `feat/frontend-ui-polish-2`
- `feature/local-deploy`

建议顺序：

1. 先开 `feat/frontend-ui-polish-2` 的 PR，修掉 `pnpm format:check` 的 2 个文件后由 owner 合并；
2. 再开 `feature/local-deploy` 的 PR，修复：
   - `apps/api/src/plugins/agent.ts` 的 `require-await`；
   - `pnpm format:check` 的 22 个文件；
   - `.env.example` 编码损坏；
   - 补充 `KNOWLEDGE_ENABLED` 配置说明；
3. 两个 PR 互相冲突（`MobileApp.tsx`、`ProfilePage.tsx`），后合并的 PR 需要 rebase 并解决冲突；
4. 合并后跑一次合并后冒烟（桌面、移动端、`#avatar`、知识库降级）。

## 紧急修复

线上事故允许 owner 临时直接合并 hotfix PR，但必须：

- 在 PR 中标注 `hotfix` 与影响范围；
- 合并后 24 小时内补齐复盘与测试；
- 不把“紧急”作为绕过 CI 的常规理由。

## 为什么不用直接 push

- 没有 review 的第二双眼睛；
- 无法保证 format / build / test 全绿；
- 出问题无法定位到单个 PR，也无法回滚单个变更；
- CODEOWNERS 与分支保护只有在 PR 流程下才生效。
