# 故障排查

| 现象 | 检查及处理 |
|---|---|
| Codex 中找不到 skill | 运行 `sh scripts/install-skill.sh status`；检查 checkout 是否仍在原位置，必要时重启 Codex。 |
| 安装报告同名冲突 | 先确认已有 `~/.agents/skills/diagram-workbench` 的来源。脚本不会覆盖它；手工决定使用哪个版本后再安装。 |
| `setup` 报平台错误 | 原生工具链目前只支持 macOS arm64。用 `uname -m` 确认架构。 |
| `Tool missing/hash mismatch` | 检查网络及 `setup --project <同一个项目>`；固定 SHA-256 不匹配时不使用该下载。 |
| `dot` 找不到 | 在已安装 Homebrew 的 Mac 上运行 `brew install graphviz`，再用 `dot -V` 核对。 |
| `check` 返回 `needs-review` | 阅读源材料和模型，按实际核对结果运行 `review`，随后重新 `build`、`check`。 |
| 新项目已经有目标文件 | `init` 会拒绝覆盖；盘点已有配置并手动迁移。 |
| 页面过期或篡改 | 运行 `status` 观察输入/输出状态；核对变更后重新审查、构建、检查。 |

仍无法解决时，开 Issue 并附系统架构、Node 版本、执行命令和不含私有信息的错误输出。
