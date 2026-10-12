# 给第一次使用者的一页说明

Diagram Workbench 把你已经核对过的项目事实呈现为架构图或领域图；[ExecPlan](https://github.com/gbm19950414-ux/exec-plan) 帮你保存复杂工作的实施与验收过程。它们各有版本和安装步骤。

1. 在 Apple 芯片 Mac 上安装 Codex、Node.js 22+、npm 和 Graphviz，并完成 [Workbench 安装](installation.md)。
2. 在 Workbench checkout 中阅读虚构软件示例 `examples/minimal/README.md`、`diagram.config.json`、`docs/architecture/evidence.json` 与 `workspace.dsl`；这一步使 `review` 成为你实际完成的核对。
3. 从同一 checkout 运行以下命令，并确认最后的 `check` 成功、`preview` 可以打开页面：

```sh
node bin/diagram-workbench.mjs setup --project examples/minimal
node bin/diagram-workbench.mjs status --project examples/minimal
node bin/diagram-workbench.mjs review --project examples/minimal --reviewer YOUR_NAME --decision updated --note '已核对这个虚构示例的说明、模型和证据映射。'
node bin/diagram-workbench.mjs build --project examples/minimal
node bin/diagram-workbench.mjs check --project examples/minimal
node bin/diagram-workbench.mjs preview --project examples/minimal
```

把 `YOUR_NAME` 换成你的名字。`preview` 用 Ctrl-C 结束。如果只想试领域图，读完 `examples/source-block-v5` 后对同一目录运行 `review`、`build`、`check`、`preview`；这一目标不需 Graphviz 或 Java。真实项目从 [安装说明](installation.md#准备项目) 的 `init` 开始，并以项目事实替换骨架。

发现缺陷或有明确建议，可在相应仓库开 Issue；想先讨论方向可用 Discussions。要修改说明或代码，可 Fork 仓库、在自己的分支提交，并向原仓库发 PR，附上运行过的检查结果。详见 [贡献指南](../CONTRIBUTING.md)。
