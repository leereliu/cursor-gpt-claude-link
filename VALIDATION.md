# 验证记录

日期：2026-10-16。

环境：macOS 15.7.3 arm64，Cursor 3.24.12，Claude Code 2.1.300，Node 24.5.0。

## 本机验收

| 检查 | 结果 |
| --- | --- |
| 官方备份签名及六个原始文件 SHA-256 | 通过 |
| desktop/glass 实际补丁锚点、语法、Agent Host 路由 | 通过 |
| 两种订阅 provider 注册、子任务参数继承、生命周期 | 通过 |
| GPT Fast/Reasoning/Context，Claude Effort/Context 转发 | 实际原始 JavaScript 检查通过 |
| 脱离源码目录启动两套 loopback 接口 | 通过；Claude 鉴权和 Origin 拒绝检查通过 |
| Cursor 启动与模型菜单 | GPT 和 Claude 同时出现，未出现 Unknown model ID |
| Claude Opus 5.5 Low 工具执行 | Cursor 显示 Edited claude.txt, explored 1 file；13 秒完成，文件实际内容和回复均为 CLAUDE_CURSOR_TOOL_OK_20261016 |
| GPT-6.1-Sol Very high Fast 工具执行 | Cursor 显示 Edited gpt.txt, explored 1 file；12 秒完成，文件实际内容和回复均为 GPT_CURSOR_FAST_TOOL_OK_20261016 |
| GPT Context UI | GPT-6-Astra 菜单显示 Codex default · 272K 和 500K，Fast 开关保持开启 |
| 官方恢复入口 | 实际完成 patched → official → patched，两个方向的文件/官方签名检查通过；最终为 patched |
| 组合来源同步 | 临时 Git 仓验证两个来源整合、测试失败回滚、未提交工作保护 |

Claude 实际工具测试包含三轮 bridge 请求，均完成。测试文件只写入临时目录，未读取用户业务文件。

## Fast 验证记录

2026-10-01 的完整对照测速已确认 GPT Fast 在当时环境中实际提高输出吞吐。模型固定为 GPT-6.1-Sol，推理强度为 xhigh，同一账号、相同斐波那契任务；Codex CLI 与实际 Cursor 界面各执行三次普通模式、三次 Fast，共 12 次成功测试，数列和校验值全部正确。所有完成事件的 `service_tier` 均为 `default`，这个返回字段没有区分实际观察到的速度差异，不能据此判定 Fast 未生效。

下表为可见输出 token/s 的中位数。可见输出 token 数为总输出减去 reasoning token 数，计时为首个至最后一个答案文字事件的间隔。

| 客户端 | 普通 token/s | Fast token/s | Fast 倍率 |
| --- | ---: | ---: | ---: |
| Codex CLI | 38.91 | 74.40 | 1.91× |
| Cursor 界面 | 38.57 | 76.10 | 1.97× |

整体输出吞吐含推理和等待时间，Codex CLI 提高到 1.98 倍，Cursor 提高到 1.94 倍。[逐次测速数据](./docs/fast-benchmark-2026-10-01.csv)保留输入与缓存 token 数、请求与返回 tier、计时和正确性结果。每组只有三次样本，缓存命中、推理长度和服务负载存在波动，上述倍率描述此次历史测量。Codex CLI 使用原生 WebSocket，Cursor 使用 HTTP SSE，各客户端的 Fast 效果以自身开关对照衡量。另有一次网络失败已按相同条件重试，未计入吞吐统计。

2026-10-16 的组合版本验收保留了 priority 请求字段与优先路由头，并验证了 Cursor Fast 的实际发送和工具调用。当天两次 11 token 短文本请求均成功，普通模式约 2.074 秒，Fast 约 2.466 秒，返回 tier 均为 `default`。这些短请求用于连通性检查，不足以评估吞吐或推翻此前完整测速的加速结论。本次未重复执行长输出测速。

Claude 请求显式设置 `fastMode: false`。未启用 usage credits，没有把 Effort 当作 Fast。

## 自动测试

本机 JavaScript 测试为 217 项通过、3 项因平台或系统版本跳过；Python 应用管理和同步测试为 13 项通过。CI 矩阵覆盖 macOS 15、macOS 26、Windows，Node 22 和 24。Windows 只运行适用的 JavaScript 测试，POSIX 应用恢复场景在 macOS 执行。

本次未执行 500K 实际填满、SSH 远端组合安装和 Remote Control 云端运行；GPT 长输出速度沿用上述历史测速记录。大上下文预算及参数保持通过原始 native JavaScript 验证；Remote Control 对本地订阅模型给出明确拒绝并保留草稿。

## 2026-10-19 来源维护

已同步 GPT 上游 `f0fee5e` 和 Claude 上游 `4b08801`，两个 leereliu 来源提交记录在 `SOURCES.json`。Artic0din 各分支没有新提交，已有 cherry-pick 作者和来源记录保留。

此次加入 Cursor 3.25.9 Windows 指纹、符号表及 picker、子任务和重试参数兼容逻辑。两个 provider 共用的上游经典 agent 路径补丁已整合，保留本机模型路由和共享 provider 注册。组合 macOS 安装仍限定 3.24.12，未将 Windows 新版本标记为 macOS 已验证。

GPT rebase 与组合合并最初遇到冲突，同步入口均恢复原分支并保留备份。随后审核差异，保留组合安装、双 provider、来源同步及 Fast 测速文档，完成冲突处理；组合仓库使用 merge 和 Claude subtree，未重写整个组合历史。

回归结果：组合仓库 JavaScript 217 项通过、3 项平台跳过，Python 13 项通过，Claude 源码语法和构建元数据检查通过。针对本机官方 3.24.12 备份，在临时目录生成候选补丁，两个 workbench 和两个 runtime 的语法、经典 agent 路径、订阅路由、provider 注册、Fast/Effort/Context 及工具生命周期检查通过。

维护只更新源码。只读状态检查确认现有安装仍为 patched 3.24.12，安装来源仍为 `e44abf11d11f498b35453d37d2803b887b15b28d`，官方备份验证通过。没有安装新补丁、重启 Cursor、启用 Claude Fast 或运行模型测速；此次恢复测试使用临时 fixture，实机恢复记录仍为 2026-10-16 的结果。

## 2026-10-20 子任务模型显示修复

代码提交 `94dd0e9` 修复 Task 卡片忽略已保存参数、按裸模型 ID 显示默认 Low 的问题。卡片使用子任务实际的 selectedModels，参数尚未加载时仅显示模型名称。GPT 与 Claude 的 xhigh 显示名称统一为 Extra High，底层参数值仍为 xhigh。

在本机 Cursor 3.24.12 重新安装后，新建无仓库测试对话并创建一个未指定模型的 generalPurpose 子任务。子任务完成、尚未打开子任务页面时，父对话卡片直接显示 `GPT-6.1-Sol Extra High Fast Completed`。打开子任务后同样显示 Extra High Fast，回复为 `SUBAGENT_DISPLAY_FIXED_OK`。保存的参数为 reasoning=xhigh、fast=true、context=500000；使用已安装 runtime 的原生归一化函数得到 reasoning.effort=xhigh、service_tier=priority。

Astra 参数菜单显示 Codex default · 272K 和 500K；实际完成两档切换，每次均保留 Extra High 与 Fast。GPT 与 Claude 的 loopback 模型目录正常返回，Claude 继续关闭 Fast。

实际完成新补丁版 → 官方版 → 新补丁版，官方签名与补丁文件 SHA-256 验证通过。安装来源记录为 `94dd0e9d9d2d3b6c6b18aa86180f0b8ed752fa03`，独立 switch-version.py 官方恢复入口保持可用。

本机 JavaScript 共 221 项通过、3 项平台跳过，Python 13 项通过；两个 workbench 的实际显示函数与原始 JavaScript 生成检查通过。修复提交的 GitHub Actions 全部通过。Fast 验收检查参数转发及现有测速记录，未重复执行速度基准或填满大上下文。

## 2026-10-20 完成后默认折叠过程

代码提交 `2df3c1b` 将 desktop 与 glass 的原生完成过程分组默认值设为关闭。运行中的过程继续显示，最终回复保留在分组之外，用户仍可点击 Worked for 手动展开和折叠。未知版本、重复或不唯一的补丁锚点会拒绝生成。

已重新安装到本机 Cursor 3.24.12，并新建 This Mac / No Repo 对话，使用 Grok 4.7 Extra High Fast 连续执行两轮验收。第一轮调用两次 Shell，完成后显示 Worked for 12s 与 `COLLAPSE_DONE_A`；第二轮调用一次 Shell，运行中可见独立过程说明与 Running 状态，完成后显示 Worked for 10s 与 `COLLAPSE_DONE_B`。两轮完成时均未点击过程分组，过程说明和工具记录自动隐藏，最终回复直接可见。两轮分别手动展开均能看到对应说明和工具记录，之后可再次折叠；离开并重新进入对话后，两组过程保持折叠，两条结论保持可见。

本机 JavaScript 共 223 项通过、3 项平台跳过，Python 13 项通过。两个真实 workbench 的生成检查均通过，覆盖原始展开行为复现、完成后折叠、活动过程、最终回复与既有 project 分组；GPT Fast/Reasoning/Context、Claude Effort/Context、Agent Host 和子任务显示回归通过。[macOS fork regressions](https://github.com/leereliu/cursor-gpt-claude-link/actions/runs/39452076151) 与 [Tests](https://github.com/leereliu/cursor-gpt-claude-link/actions/runs/39452076115) 均通过。

安装来源记录为 `2df3c1bd0f82ae8da215ce1aff87ea448b410807`，当前为 patched，管理器验证官方备份通过，独立 switch-version.py 官方恢复入口保留。本次没有重复切换官方版，实机双向恢复验证沿用本文件同日的子任务显示修复记录；未重新运行 Fast 速度基准或大上下文填满测试。

## 2026-11-05 Claude 用量错误与 CLI 订阅路由

本机 IDE 保持 Cursor 3.24.12，Claude Code 为 2.1.300。最初 `/usage` 返回 502，实际错误为 Claude 订阅未登录，终端与 bridge 的 `auth status` 都显示 `loggedIn: false`。用户完成订阅登录后，账号状态为 claude.ai / Pro，模型目录将 opus 解析为 `claude-opus-5-5`；同一 bridge 的 `/usage` 恢复 200，返回 Pro、5 小时与周用量。IDE 的 Plan & Usage 实际显示对应数据。

代码提交 `9f8e664` 保留用量接口返回的具体错误，避免将登录原因隐藏为通用 HTTP 502。覆盖登录失败、非 JSON 错误、成功用量和无效成功响应。已使用原有恢复管理器重新安装同版本补丁，安装来源为 `9f8e66412421a9066577db6666484eb851508c13`，官方备份验证通过。

IDE 新建 This Mac / No Repo 对话，选择 Claude Opus 5.5 High，由 Cursor Shell 写入并读取临时文件，最终回复及实际文件内容均为 `IDE_SUBSCRIPTION_OPUS55_OK`。

标准 cursor-agent 2026.10.22-27dcf5f 会拒绝 `claude-subscription/opus`。本次采用同版本 Cursor 官方 agent-cli-local 组件，保留 Cursor 的 CLI harness，通过原有 Responses bridge 使用 Claude 订阅；没有重写工具执行循环。组件来源、SHA-256 和固定路径记录在 README。直接 CLI 实测完成 Shell 写入与读取，文件和回复均为 `CLI_SUBSCRIPTION_OPUS55_OK`；仓库 `./cursor-agent` 入口再次实测读取 IDE 测试文件，回复 `WRAPPER_OPUS55_TOOL_OK`，结果均为 success。三次验收在 bridge 留下六个完成请求，模型均为 `claude-subscription/opus`，没有失败请求。

入口固定 loopback 路由并通过环境变量传递密钥，阻止外部推理路由及 Bedrock 覆盖；Claude Fast 保持关闭。独立临时状态目录中的真实启动测试确认：无需 IDE 启动，入口能启动已安装的双 bridge 并运行 CLI 版本查询，测试后清理该独立 worker。

交互终端启动检查显示 Cursor Agent (local-agent)、版本 2026.10.22-27dcf5f、模型 claude-subscription/opus 和独立验收工作区。该本地 CLI 组件的 `--list-models` 会访问 Cursor 后端并被 authless 模式拒绝，入口明确报告限制；普通模型推理和工具执行已通过。此次未验证交互模式的持续对话、CLI 子任务或长上下文填满，固定版本之外的 CLI 兼容性尚未验证。官方恢复沿用已有管理器，未重复执行实机双向切换。

本机完整回归为 JavaScript 225 项通过、3 项平台跳过，Python 18 项通过。原始 3.24.12 desktop/glass 补丁生成、语法、Agent Host、子任务模型显示、过程折叠和 Fast/Reasoning/Context 检查均通过。

## 2026-11-05 CLI 子任务固定 Opus 5.5 High

基线实测创建一个普通子任务，父子共四次请求均使用 Opus，但 Responses 请求没有 reasoning 字段，无法保证 High。本地 CLI 恢复已保存模型时会清空参数，启动时也可能在目录发现完成前开始推理。现在保留模型参数并等待目录加载，按原始 CLI 源码 SHA-256 和两个唯一锚点生成独立补丁文件，原始 CLI 源码保持不变。

CLI 固定配置使用精确模型 `claude-subscription/claude-opus-5-5`、reasoning=high，Explore 设为继承父任务；用户 CLI 原配置的内容与权限保持原样。CLI 的 Responses 传输仍可能漏传 reasoning，所以 `/cli/v1` 路由为父任务、子任务及辅助请求显式固定 Opus 5.5、High、200K 和普通订阅处理。IDE 原有模型与强度选择继续使用原路由。目录不再提供 Opus 5.5 High 时明确失败，不改用其他模型。

代码提交 `aabc5a9` 已更新到本机 runtime，更新前保留完整运行文件备份，并核对 CLI 专用目录只返回 Opus 5.5 High。Cursor 应用保持 3.24.12，未替换 IDE 应用文件；当前安装来源记录为 `aabc5a9`，官方签名备份验证继续通过。

最终实测通过仓库入口创建两个未指定模型或推理覆盖的子任务，分别为普通 generalPurpose 与 Explore。两个子任务各自使用 Shell 读取独立测试文件，均返回 `CHILD_FILE_PROOF_7183A`；父任务等待两者完成后返回 `PARENT_TWO_SUBAGENTS_OK` 和两个结果。父任务、普通子任务、Explore 各完成两次推理，总计六次。bridge 的有效参数和六个实际 Claude Code 进程的参数均为 `--model claude-opus-5-5 --effort high`，所有请求完成。

验证同时确认原始 CLI 源码 SHA-256 与用户原 CLI 配置未变化。去除提示词、账号和凭据的证据见 [CLI 子任务验证数据](./docs/cli-subagents-2026-11-05.json)。完整回归为 JavaScript 227 项通过、3 项平台跳过，Python 20 项通过，两个真实 workbench 的补丁生成与既有功能检查通过。未进行嵌套子任务、长时间持续对话或填满上下文测试。

## 2026-11-05 CLI 默认 500K，模型验收等待额度恢复

按用户要求，CLI 父任务和全部子任务继续固定 Opus 5.5 High，默认窗口预算从 200K 改为 500,000 tokens。代码提交 `7d4e1cd` 已在本地保存，并更新本机 runtime；更新前的运行文件备份保留在状态目录的 `backups/cli-500k-*` 下，Cursor IDE 版本和应用文件保持不变。

CLI 专用模型目录的 `context_window` 与 `capabilities.context_length` 均为 500,000，独立配置保存 context=500000，bridge 为父子请求统一设置 claude_context=500000。Claude Code 子进程继续使用 `--model claude-opus-5-5 --effort high`，新增 `--autocompact 500000` 并移除强制 200K 的环境限制。该配置采用 Opus 5.5 原生大窗口内的 500K 预算，配置依据见 [Claude Code 官方上下文设置](https://code.claude.com/docs/en/model-config#set-the-auto-compact-window)。

无需模型生成的实际 `/context` 查询已显示 `Model: claude-opus-5-5`、`Tokens: 2.3k / 500k`。完整回归为 JavaScript 228 项通过、3 项平台跳过，Python 20 项通过，两个真实 workbench 的补丁生成及原有功能检查通过。

父子任务模型验收遇到 Claude 5 小时订阅额度耗尽，未取得成功的子任务结果。用户确认额度耗尽后，已结束该测试进程，bridge active=0，没有留下后台模型重试或定时任务。本轮已确认配置、参数传递和窗口显示，尚未完成 500K 配置下的父子模型成功调用。按用户后续要求，500K 填满测试不属于验收范围；后续仅补一次短父子调用，检查实际模型、High 与 500K 参数，不构造大文本输入。当前改动仅保存在本地，未 push；后续由用户在本聊天中指示继续验收，通过后再推送。

## 2026-11-05 Claude 每轮超时延长至 10 分钟

原来的 180,000 毫秒来自本地 `claude/runner.mjs` 的子进程计时器。默认值现为 600,000 毫秒，作用于 IDE、CLI 父任务与子任务的每轮模型调用，思考与输出不会重置总计时。登录保留 15 秒超时，用量与目录查询保留各自的 20 秒超时。模拟时钟测试验证 3 分钟及 599,999 毫秒时请求仍待完成，600,000 毫秒时超时，并确认显式较短超时继续生效；没有运行十分钟的模型消耗测试。

代码提交 `e7067d1` 已更新本机运行文件，旧运行文件备份位于状态目录 `backups/cli-10min-20261105T090854Z`。Cursor IDE 保持 3.24.12，应用补丁哈希与官方签名备份校验通过，官方恢复入口仍可用。完整回归为 JavaScript 229 项通过、3 项平台跳过，Python 20 项通过；两个真实 workbench 的 Fast、Context、子任务继承、过程折叠及补丁生成检查通过。

只进行一次短父子任务测试，创建一个 Explore 子任务。父任务首次推理与子任务推理均成功，子任务返回 `CHILD_500K_OK`；两轮实际 bridge 参数均为 Opus 5.5、High、500,000，观察到的 Claude Code 进程参数均为 `--model claude-opus-5-5 --effort high --autocompact 500000`。独立 CLI 配置保存相同参数，Explore 继承父任务；原始 CLI 源码与用户原配置保持不变。

测试前订阅 5 小时额度已用 98%，父任务最终回复阶段连续失败，随后查询额度已到 100%。已主动结束该测试 CLI 的重试，bridge active=0。未构造大文本或填满 500K；完整父任务最终回复仍未验收通过，当前改动继续保存在本地，尚未 push。脱敏检查数据见 [500K 与超时验证数据](./docs/cli-500k-timeout-2026-11-05.json)。
