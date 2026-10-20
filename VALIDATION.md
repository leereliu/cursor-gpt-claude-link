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
