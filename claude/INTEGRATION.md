# 两个来源的整合记录

本仓库 fork 自 [vertexitde/cursor-claude-link](https://github.com/vertexitde/cursor-claude-link)，在原项目最新 `aa579b5` 基础上移植 [Artic0din/cursor-claude-link](https://github.com/Artic0din/cursor-claude-link) 的独有功能。整合日期为 2026-10-16。

本地与 `cursor-gpt-link` 使用并列目录。`origin` 指向 leereliu 的 fork，`upstream` 指向 vertexitde，`artic0din` 保留第二个来源的全部远端分支。

## Cherry-pick 来源

每个移植提交保留原作者及 `cherry picked from commit` 记录。合并提交以第一父提交为基准 cherry-pick，包含对应 PR 的全部改动；与较新上游发生冲突时，保留其版本表和已有功能。

| Artic0din 提交 | 移植内容 |
| --- | --- |
| `404000d` | PR 2：macOS 路径、原生 Claude、精确 bridge 重启、签名与 native loading 校验、工具名称隔离、应用权限、组合安装保护 |
| `b954252` | PR 3：可重试恢复、GPT manifest 保护、共享 macOS 安装流程、序列化 helper、Explore provider 过滤和参数、上下文兼容字段 |
| `969840f` | PR 4：Agent Host 本地执行策略、共享 provider 注册、GPT 与 Claude 嵌套路由测试 |
| `8468d18` | Remote Control 中明确拒绝本地订阅模型，保留草稿恢复的原生错误流程 |
| `175acaf` | 单独保存 macOS 3.22.12 指纹，避免覆盖 Windows 指纹 |
| `7c9f04f` | macOS 3.22.12 原生符号、安装锚点和 provider activation |
| `e32eed3` | 将上游已有的 picker 用量组件接入 macOS 安装流程 |
| `80a9e00` | `/usage` 未返回有效窗口时保留已有用量标签 |
| `bdde865`、`b4f0b7c` | 来源作者的安装和实测记录，放在 `docs/artic0din-testing.md` 并明确归属 |

`7c58956` 的单独 cherry-pick 因保留上游多版本实现而成为空改动，随后将其 `rr` / `hs` 两个 3.22.12 生命周期 fixture 与动态绑定方式移植到整合提交，默认测试会执行这些 fixture。

Artic0din 的以下提交本身是在移植已有上游功能，保留原项目的更新实现：

| Artic0din | 原项目对应提交 |
| --- | --- |
| `327811b` | `c1c3014` Explore 模型设置 |
| `ecbe41c` | `154fe4f` 验证记录 |
| `ee09623` | `87b9ff3` MAX 与上下文预算 |
| `d5caf1c` | `a2e1f1e` 子任务生命周期 |
| `77a2f55` | `e1275c6` 队列与 Plan 消息 |
| `50f5d0e` | `b0d720a` Cursor 3.20.23 |
| `086b97c` | `8818341` 标准和扩展窗口 |
| `209c35c` | `c986b4c` Cursor 3.21.1 |
| `de77252` | `e95c164` Cursor 3.21.9 |
| `3ffc54e` | `6d8ba49` Cursor 3.21.12 |

早期独立分支 `feat/macos-support` 的 `0cc0f44` 是另一套复制应用及签名备份原型，没有进入 Artic0din 后续主线。其完整代码保留为 `reference/artic0din-macos-private-copy` 分支；默认安装流程采用后续主线实现，避免同时运行两套恢复逻辑。

## 版本和运行范围

| 内容 | 当前整合结果 |
| --- | --- |
| Windows | 保留原项目所有构建指纹、安装器和 3.24.12 符号表 |
| macOS | Artic0din 的 macOS 26+、Apple Silicon、Cursor 3.22.12 安装流程 |
| macOS 指纹 | 使用独立 `build-*-darwin-arm64.json` 文件；历史 3.21.13 元数据仅作记录 |
| macOS 签名 | 保留原作者要求的 Apple signing identity 校验和 `CURSOR_MACOS_SIGN_IDENTITY` 设置 |
| GPT 配合 | 识别本机 GPT 状态目录、保护已有 manifest、恢复时保留对应安装状态 |
| Claude Fast | 来源项目仍未实现；整合不会改变 cursor-gpt-link 的 Fast 设置 |

本次完成 fork、源码整合及验证，没有安装 Claude 补丁。用户当前 Cursor 应用、GPT 补丁及官方版备份均未修改。

本机是 macOS 15.7.3，低于来源分支声明的系统门槛；当前 macOS Cursor 3.24.12 也没有被这次移植声明为支持。在该环境运行安装命令会被校验拒绝。为该环境适配并完成 GPT/Claude 组合安装，属于后续安装工作。

## 验证

```sh
npm test
npm run check:source
npm run check:macos-source
```

测试包括订阅路由、工具交接、provider 注册、Remote Control、组合恢复、原生签名 fixture、用量缓存和生命周期。GitHub Actions 同时覆盖 Windows 与 macOS 26，Node 22、24 与 26，并提供手动运行入口。

拥有匹配的原始 Cursor 3.22.12 资源时，可以执行只读的 JavaScript 检查：

```sh
node scripts/check-macos-source.mjs /path/to/Cursor.app/Contents/Resources/app
```

该检查验证五个原始 JavaScript 文件的 SHA-256、版本与 commit，再生成内存中的补丁，执行语法、实际 native AgentCompat、provider、生命周期和 Explore 参数验证。它只将候选代码写入临时目录并在结束后删除。

安装器还会检查 `product.json` 的完整指纹、系统版本和签名。本机保留的旧 3.22.12 应用 JavaScript 与来源指纹一致，但 `product.json` 字节指纹不同，因此只读 JavaScript 检查通过也不能作为该备份可直接安装的证明。
