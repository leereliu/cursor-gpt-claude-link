# cursor-gpt-claude-link

在 Cursor 本地 agent harness 中使用已有的 ChatGPT/Codex 与 Claude Code 订阅。工具执行、工作区与聊天仍由 Cursor 管理；本机 bridge 分别调用 Codex Responses 服务和 Claude Code CLI。

本仓库基于 [leereliu/cursor-gpt-link](https://github.com/leereliu/cursor-gpt-link) 与 [leereliu/cursor-claude-link](https://github.com/leereliu/cursor-claude-link)。GPT 历史保留在根目录，Claude 通过 Git subtree 保留在 `claude/`，两个项目的 MIT 许可证均保留。来源版本见 [SOURCES.json](SOURCES.json)。

## 本机版本

本次适配 macOS 15.7.3、Apple Silicon、Cursor 3.24.12，Cursor commit 为 `37b865941ccb31e2fc90c685157534efca87f960`。安装前校验官方应用签名、版本和六个原始文件的 SHA-256。未知版本会在修改应用前退出。

Node.js 22+、Python 3、已经登录的 Codex CLI 与 Claude Code CLI 是安装依赖。Claude 模型目录通过本机 CLI initialize 协议获取。

## 安装与恢复

```sh
./cursor-link status
./cursor-link check
./cursor-link install
./cursor-link official
./cursor-link patched
```

`check` 只读检查签名、指纹及实际 JavaScript 中的补丁逻辑。`install` 要求 Cursor 已退出，在完整应用副本中同时生成 GPT 和 Claude 补丁，完成检查后再替换应用。安装失败会按操作日志恢复应用、设置与运行文件。

为沿用已有的官方签名备份和恢复入口，状态目录继续使用 `~/Library/Application Support/cursor-gpt-link`。`cursor-macos` 是兼容入口。运行文件复制到状态目录，日常使用不依赖仓库目录位置。官方版恢复入口仍为：

```sh
python3 "$HOME/Library/Application Support/cursor-gpt-link/switch-version.py" official
```

升级流程为：退出 Cursor → `official` → 在官方版完成升级并退出 → 更新本仓库 → `check` → `install`。新 Cursor 版本需要审核对应指纹和符号表，无法直接假定兼容。

## 功能

| 功能 | 行为 |
| --- | --- |
| GPT | 已有 Codex 登录、Fast priority、模型支持的推理强度 |
| GPT Context | 模型目录中的默认窗口；目录上限允许且默认小于 500K 时增加 500K |
| Claude | 已有 Claude Code 登录、实时模型目录、支持的 Effort 和上下文选项 |
| Claude Fast | 当前明确关闭。保留普通订阅模式，界面不提供无法转发的开关 |
| Agent Host | 两种订阅模型均进入本地执行路径；普通 Cursor 模型保持原路径 |
| 工具调用 | Claude 结构化输出转换为 Cursor 工具请求；执行结果进入后续请求 |
| 使用量 | 两个订阅分别显示用量，不输出账号凭据 |
| 恢复 | 一次切换恢复完整的官方应用和原自动更新设置 |

[Claude 官方 Fast 文档](https://code.claude.com/docs/en/fast-mode)说明，Fast 使用 usage credits，独立于订阅额度。Effort 是推理强度。此项目不会启用额外计费；Claude 请求显式传入 `fastMode: false`。GPT Fast 是否得到优先处理以服务端返回为准。

本次验证范围为本机 Cursor。Remote Control 的云端创建接口无法访问本地订阅 bridge，会保留草稿并提示使用 This Mac。SSH 与远端运行扩展保留来源代码，尚未纳入组合安装的实机验收。

## 验证

```sh
npm run test:all
node scripts/verify-build.mjs /path/to/official/Cursor.app/Contents/Resources/app
```

覆盖源项目单元测试、组合运行、应用替换和中断恢复、实际 native JS 锚点、两类模型路由、Fast/Effort/Context 参数，以及完整官方签名恢复。实机结果见 [VALIDATION.md](VALIDATION.md)。

账号文件、bridge 密钥、完整 Cursor 应用、聊天记录、模型目录和本机日志不会提交。源码保留已有企业网络所需的 bridge TLS 配置；不修改系统证书或全局 Git 配置。
