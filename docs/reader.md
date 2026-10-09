# 本地语义模型阅读器

双击同目录的“语义模型阅读器.app”。应用会检查发布内容，启动或复用本地服务，并在默认浏览器打开模型库。阅读不需要AI、联网、系统Node/Python或源代码仓库。首版运行包适用于macOS arm64；模型文件和布局库均随包提供。

## 日常使用

在模型库选择模型和发布版本，点击“打开”。阅读页上方可切换同一模型的版本，或返回模型库。展开、选中、来源筛选、缩放和平移位置按确切发布内容分别保存。机器重启或服务停止后，再次双击应用即可恢复。

应用会自动选择可用的本机端口。不要把127.0.0.1地址当作永久入口；收藏或保留应用即可。服务只能从本机访问，没有开机自启。关闭浏览器不会立即停止后台服务；在模型库点击“停止服务”可显式关闭，下次双击应用重新启动。

整个交付目录可以复制或移动。保持.app内部文件完整。模型库、导入版本、阅读位置和日志保存在用户的`~/Library/Application Support/Semantic Model Reader/<library_id>/`。移动应用或替换同一library_id的新阅读器不会删除这些数据；不同库分别保存。相同包重复双击复用服务，旧状态文件和已停止进程会自动恢复。

## 添加模型与保留旧版本

点击“导入模型版本”，选择Workbench导出的`.skmr`或模型包JSON。工具会校验文件清单及内容hash，校验通过后作为新版本加入；重复导入同内容不会产生副本。同一模型、同一版本名对应不同内容时拒绝，要求生产者给新发布使用新版本名。损坏的包不会覆盖原版本。

模型包完整性检查不替代来源和语义审阅；导入的模型应来自你信任的建模工作流。阅读器不重新判断或补充语义关系。内含的软件脚本是发布页面的一部分。

## 打不开时

若启动失败，应用显示具体错误与“重试”。页面提示服务已停止时，重新双击应用。模型库的“运行信息”提供当前地址、运行时版本、数据目录和日志末尾。`reader.log`保存启动及导入错误；诊断不要求AI介入。

本地交付未做Apple发行者签名或公证。复制到另一机器后，系统可能要求按macOS的首次打开流程允许本地应用；本包不修改系统保护设置。macOS其他架构暂未交付对应运行时。

## 建模工具的导出入口

从已经review/build/check通过的领域站点导出模型包：

```sh
diagram-workbench reader-model --site SITE_DIRECTORY --model-id MODEL_ID --title TITLE --revision REVISION --output MODEL.skmr
```

`model-id`是跨版本稳定的阅读模型名，`revision`是确切发布的版本名；不能拿标题变化隐瞒语义修订。导出保留原站点全部文件字节及receipt，不制造新审阅事件。缺失、改动或未审的发布收据会被拒绝。

以声明式配置创建可独立运行的阅读包：

```sh
diagram-workbench reader-package --catalog CATALOG_JSON --runtime STANDALONE_NODE --runtime-license NODE_LICENSE --output-dir NEW_DIRECTORY
```

配置格式：

```json
{
  "schema": "semantic-reader-catalog/v1",
  "library_id": "example-library",
  "models": [
    {"site":"./published-site", "model_id":"example", "title":"示例模型", "revision":"release-1"},
    {"package":"./older-model.skmr"}
  ]
}
```

路径相对配置文件；站点只读，目标目录必须不存在。`library_id`保持不变以复用导入库。运行时必须是macOS arm64的独立Node22或更高发行版，otool依赖只能指向macOS系统库；提供同版本完整Node许可证。构建工具需要Node；交付后的阅读器自带Node。官方发行版LICENSE也列出Node依赖的许可。

升级阅读器时用固定新版Workbench包构建新的目录，保留原目录，再双击新应用。v1模型包和导入库继续保留；没有自动网络更新或重新接受审阅的过程。
