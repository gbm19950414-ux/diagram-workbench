# 参与贡献

使用 [Issues](https://github.com/gbm19950414-ux/diagram-workbench/issues) 报告可复现错误或明确建议；开放式问题请用 Discussions。提交修改时 Fork 仓库，在分支上完成改动、测试并向 `main` 发 Pull Request。请说明问题、修改后的行为、验证命令和结果。不要提交消费者项目数据、密钥、个人路径或生成缓存。

修改引擎前阅读 `AGENTS.md`、`docs/configuration.md` 与相关示例。运行 `npm ci`、`npm test`，涉及原生渲染时运行 `node bin/diagram-workbench.mjs setup --project .` 和 `npm run test:integration`。模型语义、证据与审查结论属于消费者；测试通过不替代真实语义审查。维护者负责审查并决定合并。
