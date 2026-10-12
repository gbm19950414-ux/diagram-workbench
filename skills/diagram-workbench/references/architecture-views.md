# Architecture views: names, questions and reuse

Read this when choosing, naming, adding or reconciling maintained diagrams. It is guidance for consumers, not a new engine schema. Keep the consumer's existing storage, identity and review process.

## Choose the question before the notation

Use the concern to choose a familiar diagram name and a notation that explains it. These are a vocabulary, not a required checklist; omit views that add no useful answer. Non-software subjects need no C4 placeholders.

| Concern | Standard display name / common notation | Broad question |
|---|---|---|
| Domain concepts | 领域概念图 / conceptual class diagram | 管理哪些东西，它们是什么意思？ |
| Software structure | 系统上下文图、容器图、组件图 / C4 | 系统与谁交互，各部分负责什么？ |
| Responsibility | 职责关系图 / roles and responsibility relationships | 谁负责执行，谁拥有事实？ |
| Data | 数据结构图 / record or entity structure; 数据流图 / data flow | 信息如何组织、保存和流转？ |
| Workflow | 流程图 / activity diagram | 工作经过哪些步骤与分支？ |
| Interaction | 交互时序图 / sequence diagram | 谁在何时向谁请求、交接和返回？ |
| Lifecycle | 状态图 / state diagram | 对象有哪些状态，什么条件下转换？ |
| Deployment | 部署图 / deployment diagram | 各部分在哪里运行、如何连接？ |

Use equivalent familiar terms in the reader's language. Notation alone does not identify concern: a class diagram may explain concepts or stored records. A responsibility overview and C4 can coexist if one explains owners and the other locates software boundaries. Activity and sequence views can coexist if one explains decisions and the other ordered handoffs. Say where to find the complementary detail.

## Make identity, scope and status legible

Show the standard diagram name first. Add a short scenario subtitle only when useful to distinguish peers. Keep the broad question in ordinary language and the specific scope separate. For example, using fictional material:

> **领域概念图｜借阅**<br>
> 回答的问题：管理哪些东西，它们是什么意思？<br>
> 表达方式：概念类图<br>
> 状态：目标设计 · 待实现<br>
> 范围：书目、读者、借阅及归还条件

Another scenario can be `交互时序图｜预约` beside `交互时序图｜归还`. Avoid repeating the project name, date, version or long explanatory text in each primary title. A portal may still identify its project. Put versions and acceptance limits in separate labels or evidence.

Distinguish current, proposed, historical, partial and unverified aspects explicitly. A successful render does not establish implementation or acceptance. When current and target views coexist, describe their correspondence and known gaps; do not imply the current view covers every part of the proposed design.

Apply naming to diagrams and reading entrances, including controllable download labels. Preserve business object names, stable IDs, original literature titles and chapter headings. Keep existing file paths and links by default. For a new diagram use a concern/notation plus a short scenario, such as `sequence-reservation.puml`, rather than a date or version as permanent identity. Do not rename original source material to fit the diagram vocabulary.

## Maintain a set of views, not a diagram per request

1. Inventory the relevant existing sources and outputs before drawing. Default to updating the view that already answers the question.
2. Add a view only when its concern, scope or abstraction level differs usefully. Record that difference and its relation to the existing view. A second entrance to the same question should reuse the same generated artifact.
3. Put shared rules and evidence in one maintained authority; views refer to it rather than inventing independent contracts. Complementary views may repeat a necessary label but should not own conflicting definitions.
4. Keep each diagram's title and question authoritative in its model source (or its existing authoritative producer when generated). The inventory is an index, not a second naming authority: derive page cards/navigation/download labels from that source wherever possible. In the consumer's existing architecture documentation maintain a compact inventory of display name, question, scope/status, source/output and relationship to nearby views. Check any manual index labels against the source; do not introduce a shared mandatory metadata engine solely for naming.
5. After edits inspect affected rendered views and old entrances, in addition to review/build/check. Confirm that a reader can explain the difference between the two most similar views in one sentence. Record technical validation separately from actual reader feedback.

A title/question/scope/status edit changes the diagram source even if its topology is unchanged: review it as an updated view and rebuild. Use `no-impact` for changes that leave the selected view unchanged, with a reason; do not use it to imply that edited explanatory claims were not reviewed.

## Small examples of the decision

- A new borrowing eligibility rule changes the existing lending activity diagram; a new dated diagram would duplicate its responsibility.
- Reservation and return handoffs may need separate sequence diagrams because their participants and scope differ. Use the same standard name with different scenario subtitles.
- A storage diagram can supplement the conceptual borrowing model when persistence details are needed. Explain which concepts map to which records and what is not yet implemented; do not call both diagrams the complete domain model.
- A source chapter entitled “Chapter 3: Time and Change” remains exactly that. The generated overview can be named `领域概念图｜时间关系`; the source title is still the evidence, not a display label to standardize.
