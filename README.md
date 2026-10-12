# Diagram Workbench

## 公开版 · 0.11.2-rc.1

本仓库提供架构图与领域模型的共享工具、Codex skill 和虚构示例。模型事实、审查结论及生成物由使用项目保存；生成图本身不证明内容正确。原创代码和文档采用 [MIT 许可证](LICENSE)；随包交付的第三方组件保留其原许可证。`package.json` 的 `private: true` 仅阻止误发 npm registry，不限制这个 GitHub 仓库的开源使用。

**新使用者先看 [一页上手指引](docs/for-a-friend.md) 和 [安装与升级](docs/installation.md)。** 本仓库与独立的 [ExecPlan](https://github.com/gbm19950414-ux/exec-plan) 仓库分别维护、分别发布。遇到错误先看 [故障排查](docs/troubleshooting.md)；改进请读 [贡献指南](CONTRIBUTING.md)。

最快的领域模型示例只需 Node.js 22+ 与 npm：

```sh
npm ci
npm test
node bin/diagram-workbench.mjs build --project examples/source-block-v5
node bin/diagram-workbench.mjs status --project examples/source-block-v5
node bin/diagram-workbench.mjs preview --project examples/source-block-v5
```

这个示例是虚构的。读完 `examples/source-block-v5/README.md`、模型与依据后，再用自己的名字运行 `review`；随后重新 `build`，并用 `check` 验证。预览用 Ctrl-C 结束。

软件架构渲染的固定工具链目前支持 **macOS arm64**。它还需 Graphviz；`setup` 会下载并校验固定版本的 Java、Structurizr 和 PlantUML。开发者验证命令是 `node bin/diagram-workbench.mjs setup --project .` 和 `npm run test:integration`。

`PUBLIC_EXPORT.json` 记录首次公开快照的来源与哈希；它不是后续提交的实时清单。首次导出时省略了旧的本地验证记录，后续版本按各自测试和 Release 记录验证。


把项目知识表达成可编辑、可核对、可重复生成的结构与行为图。当前版本保留 C4 / Structurizr、PlantUML 与证据检查能力，并通过绘图目标接口支持非软件领域模型。

工具维护表达和检查机制；使用项目维护模型、事实、假设、决策与审查结论。绘图是“提问—建模—核验—修正”中的一种手段，工具不会判断架构语义已经正确，也不会自动把源码状态认定为部署事实。

## 从问题选择图

| 问题 | 表达方式 | 核对重点 |
|---|---|---|
| 系统与谁交互、职责和依赖在哪里 | C4 / Structurizr | 边界、责任、依赖方向、外部系统 |
| 一次交互如何发生 | PlantUML 时序图 | 调用、返回、失败、并发与等待 |
| 对象如何改变状态 | PlantUML 状态图 | 条件、终止、失败与恢复 |
| 领域对象之间有什么关系 | PlantUML 类图 | 关系含义、基数、约束 |
| 某个技术机制如何工作 | PlantUML 过程或拓扑图 | 教学假设、适用范围、与项目事实的区别 |

先确定图要回答的问题，再选择边界和视图。允许拆图；被省略的关键关系应有明确去处。草图标为 proposed；重要接受结论进入使用项目的决策记录。

## 从对话选择模式

你可以明确说“使用 Diagram Workbench 的建立 / 维护 / 校准 / 查看模式”。这些是面向人的工作流，不是把语义判断硬编码进 CLI：

| 模式 | 目标 | 固定流程 |
|---|---|---|
| 建立 | 第一次形成项目的当前态模型 | 盘点证据 → 建模 → 配置监测范围 → 语义审查 → 构建与检查 |
| 维护 | 处理一个项目变更 | 判断架构影响 → 更新模型与证据或记录 no-impact → 审查 → 构建与检查 |
| 校准 | 修复长期积累的模型漂移 | 只读核对事实与模型 → 修正可证实偏差 → 审查 → 构建与检查 |
| 查看 | 阅读当前可信模型 | 检查 → 预览；需要复审时不把旧页面当作当前事实 |

模式的固定对话模板见 [工作流与提示词](docs/workflows.md)。项目级 skill 负责本项目的约束；通用 skill 负责选择模式和编排命令。

## 开始使用

环境：Node.js 22+、npm。软件架构目标另需 Graphviz，固定的 Java、Structurizr、PlantUML bootstrap 当前面向 macOS arm64；领域模型目标使用包内 SVG/HTML 渲染，不启动这些原生工具。

使用新项目时，先按 [安装说明](docs/installation.md) 固定工具版本，然后在**同一个目标项目**中依次运行 `init`、阅读并替换草稿、`setup`、`status`、`review`、`build`、`check`、`preview`。软件目标的完整命令与预期输出见 [一页上手指引](docs/for-a-friend.md)。`review` 必须由真正核对过依据的人执行，不应从模板直接复制审查结论。

`init` 只创建未审查的起始图源、配置、证据占位与项目 skill，绝不根据目录结构猜测架构事实，也不安装或升级依赖。随后用固定版本的包完成证据盘点并替换草稿。`status` 是只读摘要：报告当前模型是否需要复审，以及上次阅读产物是否仍匹配输入和哈希。`--project` 显式指定项目根目录；`--config` 默认是该目录内的 `diagram.config.json`，与调用时工作目录无关。正式示例就是本项目自身，图源位于 `docs/architecture`；`examples/minimal` 只用于自动化回归。真实项目应先完成语义审查，才运行 `review` 记录结论。

首次 `setup` 准备固定校验和的工具；此后当前提供的自包含图源可以离线构建和检查。预览显式启动并绑定回环地址，Ctrl-C 结束。生成物、运行副本和工具缓存都在使用项目的 `.architecture` 中。

## 日常使用

1. 提问并阅读相关源材料；区分现状、目标和未知。
2. 更新受影响的 DSL / UML 与来源映射，检查图的关系和失败路径。
3. 运行使用项目相关测试。`review` 记录审查者、范围和结论；`no-impact` 也需要依据。
4. `build` 生成阅读站点；`check` 核对输入快照、引用和生成物；`preview` 检查实际可读性。

`reviewed-snapshot` 只表示对这一组输入记录过审查。来源文件、图源、配置、适配器或工具代码变化后需要复审；重新构建不会消除这一要求。存在某个测试符号不等于该测试已通过。静态页面不能自行发现后续源码变化，阅读前应运行 `check`。

对于长期维护的当前态模型，可以在 `diagram.config.json` 声明可选的 `coverage` 合同。它用“问题、证据、模型或显式未知”替代“首页有多少张图”的完整度定义，并以 fail-closed 规则要求 C4 边界、领域关系、行为、生命周期、谱系和 failure/recovery 关注点。覆盖站点按目的、边界、对象、行为、恢复、谱系/证据/未知组织；C4 仍以可缩放 Structurizr 链接呈现，不要求首屏静态图。完整 schema 与兼容规则见[配置与适配器接口](docs/configuration.md)。

## 项目接入与维护

- [配置与适配器接口](docs/configuration.md)：输入声明、项目页面与语言特定验证。
- [接入、发布和恢复](docs/integration.md)：固定本地 npm 包版本，保留项目自己的知识资产。
- [代理操作说明](skills/diagram-workbench/SKILL.md)：随工具版本交付的通用绘图步骤。
- [版本记录](CHANGELOG.md)。

运行 `npm test` 检查纯校验逻辑；准备本项目缓存后运行 `npm run test:integration` 检查真实渲染与失效场景。不提供浏览器编辑器、统计图平台或软件原生工具链的跨平台 bootstrap。


## 选择绘图目标

- `software-architecture`：默认目标，旧配置和 C4 / PlantUML 能力继续使用；软件完整性合同保持。
- `domain-model`：从消费者声明的节点、关系、分组、证据和已保存轨迹生成领域图。可表达状态、流程和关系，不要求虚构软件容器。

两者共用输入指纹、证据、显式审阅、事务构建、产物校验和预览。新增目标不把训练规则或其他消费者事实写进工具。详细输入见[目标配置合同](docs/configuration.md#drawing-targets-04)。

```sh
node bin/diagram-workbench.mjs init --project /path/to/consumer --target domain-model --title '领域模型'
node bin/diagram-workbench.mjs status --project /path/to/consumer
```

先替换骨架、核对来源并记录真实 review，再 build/check/preview。领域页面支持选择分组、查看节点或关系依据、高亮保存的决策轨迹、键盘操作、窄屏列表及 SVG 导出。图与轨迹来自消费者的已发布模型，页面不计算新决策。

### Hierarchical domain reading (0.5)

`diagram-domain-model/v2` adds chapter → topic → block → element navigation to the existing `domain-model` target. Its default overview separates mainline and supporting cards and shows only declared local relationships. Readers can filter project interpretations, inspect exact source excerpts, follow breadcrumbs and source order, open the full model, or export SVG. The fictional `examples/domain-hierarchical` demonstrates shared blocks, an isolated related endpoint, and explicit speculation. See `docs/configuration.md` for the input contract.

In 0.5.1, long v2 labels are shortened mechanically in navigation and relation lists, with the complete original text available in the detail panel. Markdown tables and strictly parsed HTML tables in details retain blank cells and spans; arbitrary HTML remains escaped.

In 0.5.2, additional v2 `details` text opens under “更多说明” and uses the same safe table rendering as complete labels.

### Nested source reading (0.6)

For an independently checked book/source structure, set `target: "domain-model"`, `presentation: "nested-source"`, and `readingMap: "reading-map.json"` in the project config. The map is a separate `source-reading-map/v1` JSON input bound to the exact `model.json` SHA-256; the frozen domain model remains the semantic authority. See [the contract](docs/configuration.md#nested-source-reading-06) and the fictional `examples/source-nested` fixture. The page uses the packaged ELK 0.11.0 runtime offline. Run the usual `review`, `build`, `check`, and `preview`; a build does not establish semantic review.

In 0.7.0, an optional `diagram-domain-model/v3` model declares reviewed `reading_structures` for steps, core claims, comparisons, or multiple centres. The source hierarchy and map schema remain unchanged. Core/support roles guide the local layout; only frozen model relations are drawn, using ELK routes and labels. The fictional `examples/source-structured` fixture covers all four patterns. See [the v3 contract](docs/configuration.md#reviewed-reading-structures-07).


Version 0.8 accepts `diagram-domain-model/v4` with `source-reading-map/v2` for direct chapter/section elements and an optional partial reading structure. The nested view keeps the original heading, shows a short card preview and one highlighted original paragraph, and folds technical identity. Typed relations, source-only mode, cross-section references and SVG navigation are covered by the original fictional `examples/source-minimal-v4`. See [the v4 contract](docs/configuration.md#minimal-nested-source-reading-08).

Version 0.9 accepts `diagram-domain-model/v5` with the same map v2 shape. Typed blocks show their content types and source focus; element cards show their actual source kind. Atomic, native source, exact roll-up and project inference relations keep distinct identities, exact members, source field qualifiers and evidence. The original fictional `examples/source-block-v5` covers all four graph forms, including a native and an inferred high-level relation without matching lower edges. See [the v5 contract](docs/configuration.md#typed-blocks-and-exact-relation-identity-09).

## Standalone local reader (0.10)

Use `reader-model` to export a frozen reviewed domain site and `reader-package` to bundle a macOS arm64 reader application, standalone Node runtime and version library. Double-clicking the app starts or reuses its local service and opens the browser. It supports importing verified model packages, version-specific reading positions, diagnostics and explicit shutdown. No AI, source checkout or system Node/Python is required for reading. See [local reader guide](docs/reader.md).

## Section reading controls (0.11)

The nested source view can expand or collapse all knowledge blocks in the selected original section. Its section choice and open state persist in the URL. The v5 relation legend counts explicit, source inferred, project interpretation, and source roll-up edges from published identities; details expose an inferred source rationale and roll-up constituents. See [configuration](docs/configuration.md).
