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

## Fast 验证边界

两次短文本 GPT 请求均成功，普通模式约 2.074 秒，Fast 请求约 2.466 秒；两次服务端返回的 `service_tier` 都是 `default`。请求端的 priority 字段和 routing header 已保留并通过回归检查，但此次结果没有证明服务端实际采用优先处理。该短样本也不能作为 token/s 或加速倍率基准。

Claude 请求显式设置 `fastMode: false`。未启用 usage credits，没有把 Effort 当作 Fast。

## 自动测试

本机 JavaScript 测试为 217 项通过、3 项因平台或系统版本跳过；Python 应用管理和同步测试为 13 项通过。CI 矩阵覆盖 macOS 15、macOS 26、Windows，Node 22 和 24。Windows 只运行适用的 JavaScript 测试，POSIX 应用恢复场景在 macOS 执行。

未执行 500K 实际填满、长输出速度基准、SSH 远端组合安装和 Remote Control 云端运行。大上下文预算及参数保持通过原始 native JavaScript 验证；Remote Control 对本地订阅模型给出明确拒绝并保留草稿。
