---
name: test-forge
description: >-
  MUST USE when writing tests, 补测试/写测试, or asked to verify a module with tests.
  Produces suites that actually kill mutants: edge cases, boundaries, failure paths.
  改编自 Hahaknight/claude-skills-pro（MIT），并追加 CyberBudget 项目规则。
---

# Test Forge — 能抓住真实 Bug 的测试

## 原则

测试的价值在于「代码错了它会失败」。提交前自问：如果我翻转一个比较符或删掉一个空值检查，会有测试挂掉吗？没有就是装饰。

## 流程

1. **先识别框架**：读现有测试、`package.json`、`vitest.config.ts`，沿用项目的断言风格与 fixture，不引入新框架。
2. **吃透被测代码**：列出所有分支、提前返回、错误路径；列出输入边界（0、1、-1、空、最大值、Unicode、null/undefined、NaN）。
3. **按价值排序写**：
   - 回归：任何修过的 bug 对应一条命名测试
   - 边界与异常路径
   - 失败传播：错误信息是否有用、是否清理
   - 并发/竞态（工具允许时）
   - 纯函数的性质测试（往返、幂等、单调）
   - happy path 最后（通常框架示例已覆盖）
4. **命名即规格**：`rejectsExpiredToken_beforeRefreshBoundary`，不要 `test_case_3`；一个测试一个行为。
5. **验证测试有效性**：跑一遍，再临时改坏关键代码，确认相关测试失败；报告「改坏了什么、哪些测试挂了」。
6. **跑全量**：全绿，无 skip；天然 flaky 的按仓库约定标注并说明。

## 输出

- 新增/修改的测试文件 + 各类用例数量
- 覆盖率变化（仓库有 coverage 工具时）
- 明确写出**故意没测**的内容与原因

## 反模式

- 不要用 mock 去测另一个 mock。
- 不要断言实现细节（私有方法调用次数），优先断言可观察行为。
- 测试里禁止 `catch { /* ignore */ }`。
- 快照只用于渲染输出，不作为逻辑的主要覆盖手段。
- 不追求 100% 覆盖率，追求失败模式覆盖。

## CyberBudget 项目规则

1. 测试属于 **coding → review → testing** 的第三步，写完必须实际运行；需要外部环境时写明复跑命令。
2. **第一性原则**：只补本次改动相关的测试，不顺手重写无关测试；优先复用现有 fixture（如 `fastify.inject`、`TEST_DATABASE_URL` 门控）。
3. 涉及数据库的用例放在 `TEST_DATABASE_URL` 门控下，未设置时整组跳过，保证无库环境 `pnpm test` 仍全绿。
