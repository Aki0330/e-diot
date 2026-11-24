# Pull Request

## 变更内容

<!-- 一句话说明这个 PR 解决什么问题 -->

## 关联 Issue

<!-- Closes #123；没有就写「无」 -->

## 验证

- [ ] `pnpm format:check`
- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`（涉及 DB 时使用 `TEST_DATABASE_URL`）

验证结果 / 复跑命令：

```text

```

## 风险与回滚

<!-- 影响范围、兼容性、迁移、回滚方式；无风险写「无」 -->

## UI 截图（如有）

<!-- 桌面 + 移动端；没有 UI 改动可删除本节 -->

## 检查项

- [ ] 没有提交密钥、`.env.local`、构建产物或无关文件
- [ ] 新增/修改的行为有测试或明确说明未覆盖原因
- [ ] 接口/数据库变更已说明兼容性与迁移步骤
- [ ] 已阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)，不自行合并

> 合并由 maintainer / owner 执行；贡献者请勿自行 merge。
