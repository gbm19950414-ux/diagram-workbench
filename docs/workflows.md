# Conversation workflows

Use the project path and a mode in every request. The mode fixes the workflow gates; the question, evidence and diagram selection remain project-specific.

Before selecting or adding views, apply the skill's [view naming, questions and reuse reference](../skills/diagram-workbench/references/architecture-views.md). It defines the shared vocabulary and update-versus-add decision; keep the concrete inventory and source-owned labels with each consumer.

## Establish

```
Use Diagram Workbench in Establish mode.
Project: /absolute/project/path
Authority: current repository facts only
Goal: create the maintained current-state structure and behaviour model
```

Read project instructions and sources first. `init` is permitted only to create a draft scaffold. Establish the actual C4 and PlantUML sources, evidence links and watch scope before semantic review. Run relevant tests, then `review --decision updated`, `build`, and `check`.

## Maintain

```
Use Diagram Workbench in Maintain mode.
Project: /absolute/project/path
Change: <task, commit, files, or stated decision>
```

Determine whether the change affects a modelled fact. Update model sources and evidence when it does; otherwise use `review --decision no-impact` with the evidence for that judgment. Run relevant tests, build and check.

## Calibrate

```
Use Diagram Workbench in Calibrate mode.
Project: /absolute/project/path
Authority: current repository facts only
Repair: yes | no
```

Start read-only. Report discrepancies among model, evidence and watched inputs. With `Repair: yes`, treat each accepted repair as Maintain work. Never convert an unverified design or external-repository assertion into a current fact.

## View

```
Use Diagram Workbench in View mode.
Project: /absolute/project/path
```

Run `status` and `check`, then run `preview` only when the model is reviewed and the output verifies. If either condition fails, report the repair required instead of presenting stale output as current.


## 按绘图目标建立与维护

首先读取 `target`；缺省走旧软件架构流程。新增 `domain-model` 消费者使用 `init --target domain-model`，以自己的模型/来源替换未审阅骨架。按目标核对结构、关系方向、状态、依据和显式未知；领域目标无需 C4 容器或部署视图。接受模型仍需要真实语义审阅，之后使用相同 review/build/check/preview 生命周期。

领域图从已发布消费者模型生成；轨迹来自已保存的决策。核对节点/关系点击依据、分组中的直接关联端点、孤立要素、环、对称关系、键盘和窄屏列表。按配置声明所有输入与适配器；共享的指纹和产物检查用于发现失效，不用于证明语义正确。
