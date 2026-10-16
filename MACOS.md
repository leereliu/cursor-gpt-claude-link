# macOS 组合安装

当前入口、兼容版本、Fast/Context 和官方恢复流程见 [README.md](README.md)。

`./cursor-link` 与 `./cursor-macos` 使用同一套经过恢复测试的管理器。状态目录继续使用 `~/Library/Application Support/cursor-gpt-link`，从而保留原有官方应用备份、设置及恢复入口。

`./sync-upstream` 同步两个 leereliu 来源仓库，仅更新源码并运行测试。源 GPT fork 继续 rebase vertexitde 上游；组合仓库保留 Git subtree 的合并历史，避免将 Claude 文件错误重放到根目录。冲突或测试失败时恢复原分支并保留备份引用。同步流程不安装应用。
