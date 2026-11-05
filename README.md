# cursor-gpt-claude-link

在 Cursor 本地 agent harness 中使用已有的 ChatGPT/Codex 与 Claude Code 订阅。工具执行、工作区与聊天仍由 Cursor 管理；本机 bridge 分别调用 Codex Responses 服务和 Claude Code CLI。

本仓库基于 [leereliu/cursor-gpt-link](https://github.com/leereliu/cursor-gpt-link) 与 [leereliu/cursor-claude-link](https://github.com/leereliu/cursor-claude-link)。GPT 历史保留在根目录，Claude 通过 Git subtree 保留在 `claude/`，两个项目的 MIT 许可证均保留。来源版本见 [SOURCES.json](SOURCES.json)。

## 本机版本

本次适配 macOS 15.7.3、Apple Silicon、Cursor 3.24.12，Cursor commit 为 `37b865941ccb31e2fc90c685157534efca87f960`。安装前校验官方应用签名、版本和六个原始文件的 SHA-256。未知版本会在修改应用前退出。

2026-10-19 已同步来源项目新增的 Cursor 3.25.9 Windows 指纹和兼容逻辑；本仓库的组合安装仍限定已审核的 macOS Cursor 3.24.12。

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
| GPT | 已有 Codex 登录、Fast priority、模型支持的推理强度；`xhigh` 显示为 `Extra High` |
| GPT Context | 模型目录中的默认窗口；目录上限允许且默认小于 500K 时增加 500K |
| Claude | 已有 Claude Code 登录、实时模型目录、支持的 Effort 和上下文选项 |
| Claude Fast | 当前明确关闭。保留普通订阅模式，界面不提供无法转发的开关 |
| Agent Host | 两种订阅模型均进入本地执行路径；3.24.12 起按上游兼容补丁统一使用经典 agent 路径 |
| 子任务卡片 | 使用子任务实际保存的推理、Fast 和上下文参数；参数未加载时只显示模型名称 |
| 过程展示 | 完成后的 Worked for 默认折叠，保留最终结论和手动展开入口；适用于订阅模型与 Cursor 原生模型 |
| 工具调用 | Claude 结构化输出转换为 Cursor 工具请求；执行结果进入后续请求 |
| 使用量 | 两个订阅分别显示用量，不输出账号凭据 |
| 恢复 | 一次切换恢复完整的官方应用和原自动更新设置 |

[Claude 官方 Fast 文档](https://code.claude.com/docs/en/fast-mode)说明，Fast 使用 usage credits，独立于订阅额度。Effort 是推理强度。此项目不会启用额外计费；Claude 请求显式传入 `fastMode: false`。GPT Fast 在此前 Codex CLI 与 Cursor 的对照测速中已观察到实际加速，即使服务端返回 `service_tier: default`。该字段不能单独判断 Fast 是否生效；测速数据见 [验证记录](./VALIDATION.md#fast-验证记录)。

本次验证范围为本机 Cursor。Remote Control 的云端创建接口无法访问本地订阅 bridge，会保留草稿并提示使用 This Mac。SSH 与远端运行扩展保留来源代码，尚未纳入组合安装的实机验收。

## Cursor CLI 使用 Claude 订阅

```sh
./cursor-agent
./cursor-agent --print --workspace /path/to/project "检查这个项目"
```

此入口使用 Cursor 官方本地推理 CLI 的 harness，固定为 Claude 订阅 **Opus 5.5 High**，父任务和所有子任务相同。工具执行、权限、会话和 CLI 界面由 Cursor 管理；模型请求进入同一个本机 Claude 订阅 bridge，Claude Code 只承担推理。CLI 的 `/cli/v1` 路由只公布精确模型 `claude-subscription/claude-opus-5-5`，并为每次请求显式设置 High，避免本地 CLI 漏传推理参数时回落到默认值。Claude Fast 继续关闭。入口会在 IDE 关闭时启动已安装的 bridge，密钥经环境变量传入，推理路由固定为 loopback；`--model` 和推理路由覆盖会被拒绝。

启动时从用户 CLI 配置生成独立的 `~/Library/Application Support/cursor-gpt-link/cli-opus55-high/cli-config.json`，保留权限等设置，固定模型和 High，并将 Explore 设为继承父任务。用户原配置保持原样。本地 CLI 的目录加载时序和保存参数恢复通过两处经过 SHA-256 及唯一锚点检查的补丁修复，生成同目录的 `index.opus55-high.js`，原始 `index.js` 保留。

本机已安装的独立依赖为 Cursor 官方 `agent-cli-local` 版本 `2026.10.22-27dcf5f`，路径为 `~/.local/share/cursor-agent-local/versions/2026.10.22-27dcf5f/cursor-agent-local`。组件来自 [Cursor 官方下载](https://downloads.cursor.com/lab/2026.10.22-27dcf5f/darwin/arm64/agent-cli-local-package.tar.gz)，归档 SHA-256 为 `9e5d0428455dd5aa440743ea8a48cc0f11b0dc57f1d05cf011f8ae2ef7a15097`，解压时去除首层目录。仓库不包含该组件。标准 `cursor-agent` 安装继续保留；本仓库入口使用 `./cursor-agent`。

这个本地推理组件使用尚未公开稳定的 CLI 接口，因此固定已验证版本。`--list-models` 在该版本会访问 Cursor 后端并被 authless 模式拒绝；本仓库入口明确报告该限制。跨版本更新需要重新验证。

## 验证

```sh
npm run test:all
node scripts/verify-build.mjs /path/to/official/Cursor.app/Contents/Resources/app
```

覆盖源项目单元测试、组合运行、应用替换和中断恢复、实际 native JS 锚点、两类模型路由、Fast/Effort/Context 参数，以及完整官方签名恢复。实机结果见 [VALIDATION.md](VALIDATION.md)。

账号文件、bridge 密钥、完整 Cursor 应用、聊天记录、模型目录和本机日志不会提交。源码保留已有企业网络所需的 bridge TLS 配置；不修改系统证书或全局 Git 配置。

## 来源同步

```sh
./sync-upstream
./sync-upstream --no-push
```

同步要求干净的 `main` 且与 `origin/main` 一致，自动配置缺少的来源 remote，创建备份引用，整合 GPT 基线和 Claude subtree，运行全部回归，再使用精确远端 SHA 的 lease 推送。冲突或测试失败时恢复原分支；远端并发更新时保留本地已验证结果。

原 GPT fork 继续 rebase vertexitde 上游，组合仓库合并两个来源的更新以保留 subtree 历史。同步按用户在本聊天中的指示执行；实际更新 Cursor 补丁通过 `./cursor-link install` 完成。
