# 第三方组件

本仓库原创内容使用 MIT；安装或打包时用到的依赖保持各自许可证。

| 组件 | 版本 | 使用方式 | 许可证来源 |
|---|---|---|---|
| elkjs | 0.11.0 | npm 依赖，`npm pack` 会捆绑它 | 包内 `node_modules/elkjs/LICENSE.md`，EPL-2.0 |
| markdown-it | 14.3.2 | npm 依赖 | 安装包内 `node_modules/markdown-it/LICENSE`，MIT |
| Structurizr | 2026.06.28 | `setup` 从固定 URL 下载并校验；本仓库不再分发其二进制 | 上游发行物 |
| PlantUML | 1.2026.2 | 同上 | 上游发行物 |
| Temurin JRE | 21.0.12.1 | 同上 | 上游发行物 |

具体 URL 和 SHA-256 在 `templates/toolchain.json`；更新组件时需重新核对对应许可证与打包内容。独立阅读器构建时要求传入 Node 运行时的完整许可证，见 `docs/reader.md`。
