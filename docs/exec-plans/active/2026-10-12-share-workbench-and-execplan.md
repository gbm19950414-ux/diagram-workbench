# Share Diagram Workbench and ExecPlan as reproducible Codex tools

此计划协调两个独立仓库。Diagram Workbench 仓库负责本计划的生命周期；ExecPlan 仓库通过 README 引用本计划。用户在 2026-10-12 明确要求实施两个公开仓库、MIT 许可、Apple 芯片 Mac 与 Codex 的首次交付，包括发布候选版本和对方实测后的稳定版本。

## Purpose / Big Picture

陌生使用者仅凭仓库说明即可获取固定版本、安装两个 skill、运行虚构示例、在自己的项目中使用工具，并通过 Issue 或 PR 提出反馈。对方电脑上的实际试用是稳定版验收的一部分；没有证据时保持候选版状态。

## Progress

<!-- execplan-progress:start -->
```json
{
  "schema": "execplan-progress/v1",
  "plan_id": "share-workbench-execplan-2026-10-12",
  "title": "共享 Diagram Workbench 与 ExecPlan",
  "objective": "两个公开仓库提供可复现的 macOS arm64 Codex 安装、示例和贡献入口",
  "execution_status": "active",
  "assessment": {
    "outcome": "unassessed",
    "summary": "ExecPlan 仓库和 CI 已上线，Workbench 的本机验证通过；候选版与对方实测尚无证据",
    "evidence": []
  },
  "milestones": [
    {
      "id": "source",
      "title": "整理两个独立公开仓库与许可",
      "state": "doing",
      "depends_on": [],
      "evidence": [
        "ExecPlan 初始提交 15d6e51 与 CI 提交 4d19a87 已公开；Workbench 共享变更仍待提交"
      ]
    },
    {
      "id": "onboarding",
      "title": "安装、示例、贡献与升级文档可独立使用",
      "state": "doing",
      "depends_on": [
        "source"
      ],
      "evidence": [
        "本机已验证两套安装生命周期；ExecPlan 示例与单元测试通过；Workbench 包 smoke 和单元/原生集成通过"
      ]
    },
    {
      "id": "candidate",
      "title": "自动与本机验证通过并发布候选版本",
      "state": "todo",
      "depends_on": [
        "onboarding"
      ],
      "evidence": []
    },
    {
      "id": "trial",
      "title": "使用者实测与协作闭环后发布稳定版",
      "state": "todo",
      "depends_on": [
        "candidate"
      ],
      "evidence": []
    }
  ],
  "next_action": "完成 Workbench 自身构建核对、提交公开 PR 并验证线上 CI",
  "updated_at": "2026-10-12T09:48:35+08:00",
  "published_sha256": "5c8117be9c44d3adaaf891168c465e4438d4ea0f87d01866efb096d0a3daccfa"
}
```
<!-- execplan-progress:end -->

<!-- execplan-summary:start -->
<!-- Generated from the JSON above; edit the JSON, not these checkboxes. -->
- [ ] (2026-10-12T09:48:35+08:00) source · 整理两个独立公开仓库与许可 [进行中]
- [ ] (2026-10-12T09:48:35+08:00) onboarding · 安装、示例、贡献与升级文档可独立使用 [进行中]
- [ ] (2026-10-12T09:48:35+08:00) candidate · 自动与本机验证通过并发布候选版本 [待做]
- [ ] (2026-10-12T09:48:35+08:00) trial · 使用者实测与协作闭环后发布稳定版 [待做]
<!-- execplan-summary:end -->

## Surprises & Discoveries

- GitHub 已有公开的 `gbm19950414-ux/diagram-workbench`，其 `main` 只有干净的 `bfa9f7aa2beb2ab793d37f60d36a4a8e7c665aee` 初始提交；外置盘本地仓库没有配置远程，而且比导出基线多两次视图说明提交。
- 个人 `exec-plan` skill 原本不是 Git 仓库，且脚本导入 `fcntl`，本轮只承诺 macOS；`SKILL.md` 的文件引用均在完整目录中。
- 本仓库原有 README 说明初始公开导出没有再利用许可。加入 MIT 后须一并更正文档和 npm 元数据。
- `markdown-it` 14.1.0 有已公布的拒绝服务问题；升级至 14.3.2 后 npm 审计为 0 项已知漏洞，本地单元、原生集成和从 tgz 安装的 smoke 检查通过。
- GitHub CLI 的 OAuth 凭证缺少 `workflow` scope。ExecPlan 的源码先以该凭证推送，CI 文件再用已连接的 GitHub 工具创建；远程 CI 提交已快进同步到本地，没有改变全局认证配置。

## Decision Log

- Decision: 保留 Workbench 已公开仓库及干净历史；ExecPlan 建新公开仓库；两者 MIT；首版 macOS arm64 Codex；此仓库保存唯一跨仓库计划。Date/Author: 2026-10-12 / 用户与 Codex。Rationale: 保留已公开成果，同时独立版本化两套工具。
- Authorization: 用户在本聊天明确要求实施完整计划，涵盖两个公开仓库、候选版、MIT、Issue/PR/CI 配置。`authorization_state`: `approved`; `authorization_source`: 用户 2026-10-12 的“PLEASE IMPLEMENT THIS PLAN”；`authorization_evidence`: 本计划所附完整方案与用户明确实施指令；`authorized_scope`: 本计划目标、下列两个仓库的共享源码/文档/配置/发布资产；保留既有本地安装与消费项目，图的语义审查和计划授权边界不改变。

## Outcomes & Retrospective

待填写：每个仓库的提交、Release、验证结果和使用者试用反馈。没有对方证据时，将 `trial` 留为待完成，候选版不标记稳定交付。

## Context and Orientation

协调仓库工作目录是本仓库根目录，可用 `git rev-parse --show-toplevel` 获得绝对路径；角色为工具与计划协调，起点分支 `shareable-release`，基线 `bfa9f7aa2beb2ab793d37f60d36a4a8e7c665aee`，开始时干净。原始开发参考是所有者本地未关联远程的仓库，基线 `f378697e3e788b9def65998da1bbf1b340f2396a`，开始时干净；仅复制经筛选的通用内容。

参与仓库工作目录是与本仓库同级的 `../exec-plan`，可从那里运行 `git rev-parse --show-toplevel` 获得绝对路径；角色为独立 skill 发布，初始无历史、`main` 分支。原始个人 skill 只读取包内七个源文件，不修改个人安装。两个输出仓库仅允许共享工具源码、虚构示例、相关文档、自动检查、许可证与发布配置；真实消费者的知识资产、缓存、用户配置及个人绝对路径均禁止进入发布内容。

## Plan of Work

先比对公开 Workbench 与本地通用新增内容，补上许可、安装、示例、贡献和版本资料；再将 ExecPlan 完整 skill 目录整理为独立仓库并补同类入口。对两者分别跑测试和安装生命周期检查。最后创建各自候选 Release 并记录工件哈希，等待另一台 Apple 芯片 Mac 的试用结果决定稳定版。

## Concrete Steps

在两个工作目录分别创建 README、LICENSE、`.github` 模板、CI、安装脚本和上手示例。Workbench 运行 `npm ci`、`npm test`、`node bin/diagram-workbench.mjs setup --project .`、`npm run test:integration`、`npm pack`；ExecPlan 运行 `python3 -m unittest discover -s skills/exec-plan/scripts -p 'test_*.py'` 与 `python3 skills/exec-plan/scripts/execplan_progress.py check <计划路径>`。对新计划，先依据证据更新本 JSON，再从 ExecPlan skill 根运行 `python3 scripts/execplan_progress.py publish <计划路径>`、`check`。发行前检查两个独立克隆中的文件、权限、标签和发布资产。

## Validation and Acceptance

干净克隆不依赖外置盘或个人 skill；固定版本包、脚本和示例可运行。Workbench 软件示例须经过真实 review/build/check/preview，领域示例亦可在无原生工具时 build/check/preview。ExecPlan 示例须展示 `check` 的待同步与已同步状态，并不把同步当作验收。安装重复执行不改变既有同名非本工具链接；升级、回退和卸载可复验。PR 自动检查与两个 Release 可从公开界面观察；使用者未实测则只记录候选版。

## Idempotence and Recovery

在工作分支实施并单独提交各仓库的相关文件。失败时保存诊断、不重置任何仓库或覆盖现有安装；修复后重跑受影响检查。Release 工件不可同名替换，错误版本通过新标签发布。已有用户数据只在其消费者项目中维护，不随工具仓库迁移。

## Artifacts and Notes

仓库 URL：`https://github.com/gbm19950414-ux/diagram-workbench` 与 `https://github.com/gbm19950414-ux/exec-plan`。ExecPlan 首轮 GitHub Actions 运行 `38193168594` 成功。本机已观察 Workbench 62 项单元测试、5 项原生集成测试及实际 `.tgz` 的 build/check/preview 通过；ExecPlan 3 项测试、虚构合计示例和进度 `check` 通过。发布版本仍需记录 Git 提交、工件 SHA-256、CI 结果和试用者环境。

## Interfaces and Dependencies

Workbench 维持现有 CLI 与模型协议，Node.js 22+、npm、Graphviz；软件目标另外通过固定 URL/SHA-256 准备 Java、Structurizr、PlantUML。项目消费包使用版本化 `.tgz` 和 npm `file:` 依赖。ExecPlan 保持 `execplan-progress/v1` 与 Python 标准库脚本，首版支持 Python 3.11+ 的 macOS。两个 Codex skill 使用完整目录并通过 `~/.agents/skills` 发现；安装入口只管理自己创建的链接。

Change note (2026-10-12): 根据用户确认的分享方案建立唯一跨仓库实施计划。
Change note (2026-10-12): 记录 ExecPlan 仓库与 CI 上线、本机验证和 GitHub 工作流上传方式；Workbench 候选版仍待发布。
