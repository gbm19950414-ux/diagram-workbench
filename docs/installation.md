# 安装、升级与回退

首版目标环境为 Apple 芯片 Mac、Codex、Node.js 22+、npm。软件架构图另需 Graphviz (`dot -V`)；首次 `setup` 需要联网下载固定 SHA-256 的 Java、Structurizr 和 PlantUML。领域模型不需要这些原生渲染器。开始前检查 `uname -m`、`node --version`、`npm --version`、`dot -V`；在已安装 Homebrew 的 Mac 上，可用 `brew install node graphviz` 补齐缺失依赖，再核对 Node.js 不低于 22。

## 两项独立安装

Codex skill 提供工作步骤；npm 包提供绘图 CLI。安装一个不会自动安装另一个。

将下列 checkout 放在长期保留的位置；符号链接会指向它：

```sh
git clone https://github.com/gbm19950414-ux/diagram-workbench.git
cd diagram-workbench
git checkout v0.11.2-rc.2
npm ci
sh scripts/install-skill.sh install
sh scripts/install-skill.sh status
```

`install` 只在 `~/.agents/skills/diagram-workbench` 不存在时建立链接；已有同名文件或其他链接则报冲突并保持原状。Codex 通常自动发现新 skill；如果没有出现，重新启动 Codex，然后用 `$diagram-workbench` 明确调用。无需复制外置盘路径或修改 Codex 的全局配置。

为**每个消费者项目**固定一个绘图引擎版本。仍在本工具 checkout 时运行：

```sh
npm pack
```

把生成的 `diagram-workbench-0.11.2-rc.2.tgz` 复制到消费者项目中受版本管理的 `tools/vendor/`；从消费者项目根运行 `npm install --save ./tools/vendor/diagram-workbench-0.11.2-rc.2.tgz`，并提交项目的 `package.json`、`package-lock.json` 和包文件。随后在消费者项目调用 `./node_modules/.bin/diagram-workbench`。本仓库的 `private: true` 阻止误发 npm registry，不影响 GitHub 下载或本地 `npm pack`。

## 更新或回退

保留原标签；先 `git fetch --tags`，再 `git checkout <新标签>` 或 `git checkout <旧标签>`。skill 链接跟随 checkout；消费者项目的 `.tgz` 版本**不会**自动更新。要升级消费者项目，先按新标签重新打包并更新该项目的依赖和 lockfile，完成相关测试、语义复审、`build`、`check`、`preview`。回退时取回旧标签和旧 `.tgz`，在消费者项目重新安装并核对。

运行 `sh scripts/install-skill.sh uninstall` 只删除本脚本创建且仍指向当前 checkout 的链接。脚本不会删除 checkout、消费者文件或同名的其他安装。可把第二个参数设为一个临时 skills 目录，以演练安装生命周期。

## 准备项目

在**消费者项目根目录**调用已固定的 CLI：

```sh
./node_modules/.bin/diagram-workbench init --project . --title '我的项目'
```

这会创建未经审查的骨架。先阅读真实项目的说明与依据，替换模型及证据，再依照 [README](../README.md#日常使用) 进行 `setup`、`status`、`review`、`build`、`check`、`preview`。不要把骨架标记为已审查。`domain-model` 可在 `init` 时使用 `--target domain-model`。
