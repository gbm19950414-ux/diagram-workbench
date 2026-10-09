# 接入、发布和恢复

1. 在使用项目准备配置、DSL、UML 和来源清单。项目数据、ADR 和审查记录保留在使用项目。
2. 在工具项目完成 `npm test` 和 `npm run test:integration`，然后 `npm pack`。包是私有包，不发布到 npm registry。
3. 将版本化 tgz 保存到使用项目的受版本管理目录，用 npm 的 `file:` 依赖安装并提交 lockfile。例如使用项目可保存到 `tools/vendor/diagram-workbench-0.11.1.tgz`。
4. 首次接入可使用 `diagram-workbench init --project <root>` 生成未审查的起始模型，再将版本化 tgz 作为项目依赖。`init` 不替代证据盘点或语义审查。它同时生成项目自己的 `architecture-model` skill，负责本地触发和约束；通用 skill 负责四种对话模式。项目入口调用包内 CLI 或 `createWorkbench`，保留既有命令。该包内 skill 不依赖自动发现；项目 skill 或用户级 skill 负责显式读取。
5. 对工具升级造成的快照变化完成明确复审，再构建、检查和浏览。工具版本升级不会自动接受旧审查。

未来版本修改 `package.json` 与 changelog，通过测试后产生新文件名的 tgz，再由使用项目明确升级。不要让运行入口依赖另一个 checkout 的绝对路径或开发软链接。依赖安装属于准备阶段；使用现有缓存的构建/检查不需要网络。


一份软件结构模型可以生成多视图；状态、时序、领域图继续使用各自源文件。这里的“唯一来源”指明确的维护归属，不要求把所有知识放进同一个 DSL。Archify 可继续生成标明来源版本与省略范围的展示副本。


## 0.4 drawing targets

Pin the 0.4.0 package to use `target: domain-model`. Existing target-less configurations retain software behavior. Install the exact local tarball and record its hash; upgrading package bytes makes prior reviews stale by design. No global skill install or renderer upgrade is needed. Domain and software consumers share publication checks; a domain consumer needs no native tool cache. See configuration documentation and the two independent domain fixtures.
