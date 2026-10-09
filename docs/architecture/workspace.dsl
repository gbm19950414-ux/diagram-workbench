workspace "Diagram Workbench" "本项目使用自身工具维护结构与行为图" {
    model {
        author = person "使用者 / 代理" "维护问题、模型和证据，执行审查"
        workbench = softwareSystem "Diagram Workbench" "读取显式指定的使用项目，生成与检查图形阅读入口" {
            cli = container "CLI 与构建协调器" "选择软件或领域目标；初始化未审查模型；核对来源与快照；内置 SVG 领域渲染；管理构建与预览" "Node.js ESM"
            renderers = container "结构与行为渲染器" "验证和导出 C4 / PlantUML；预览时提供完整结构阅读视图" "Java / Structurizr / PlantUML"
        }
        git = softwareSystem "Git CLI" "可选的工作区版本信息；非 Git 项目保留空版本信息"
        graphviz = softwareSystem "Graphviz" "图形布局工具"
        author -> cli "指定项目；编辑图源并审查"
        cli -> renderers "软件目标验证与导出图源；启动原生预览"
        cli -> git "读取 HEAD 与工作区状态"
        renderers -> graphviz "按图型需要布局"
    }
    views {
        systemContext workbench "Context" {
            include *
            autolayout lr 160 160
        }
        container workbench "Containers" {
            include *
            autolayout lr 160 160
        }
        styles {
            element "Element" {
                background "#e9f2ff"
                color "#153459"
                stroke "#7393ba"
            }
            element "Person" {
                shape Person
            }
        }
    }
    !docs pages
}
