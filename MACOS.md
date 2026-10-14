# macOS 安装、升级与恢复

此 fork 基于 [vertexitde/cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link)，保留 Cursor 本地 agent runtime，并通过本机 bridge 使用已有 Codex 登录。工具执行和会话管理由 Cursor harness 负责。

当前已验证 macOS arm64 Cursor 3.24.12，构建 `37b865941ccb31e2fc90c685157534efca87f960`。仓库也保留此前 3.22.12 的 Darwin 指纹。新版本需要对应的已审核构建指纹和符号表；未知构建会在修改应用前退出。

## 日常入口

需要 Node.js 22 以上、Python 3、Git 和已登录的 Codex CLI。默认应用为 `/Applications/Cursor.app`。

```sh
# 只读检查当前补丁、官方版备份
./cursor-macos status

# 只读验证官方签名、构建指纹及生成补丁的回归检查
./cursor-macos check

# Cursor 退出后安装或重新应用当前仓库中的补丁
./cursor-macos install

# 切换到签名完整的官方版，同时恢复原自动更新设置
./cursor-macos official

# 切回已经保存的补丁版
./cursor-macos patched
```

安装过程在应用副本上完成补丁生成与语法校验，通过后才替换应用。它保留完整官方应用、旧补丁、安装记录和每次操作的恢复记录。用户资料、账号与聊天记录仍使用原目录。脚本检测到运行中的 Cursor 会退出，便于保存未发送内容后重新执行。

状态目录是 `~/Library/Application Support/cursor-gpt-link`，可通过 `CURSOR_GPT_LINK_HOME` 指定其他目录。Node 可执行文件与 bridge 位于该目录，不依赖 Cursor 自带 Node，也不依赖仓库保留在原位置。官方恢复入口会安装到：

```sh
python3 "$HOME/Library/Application Support/cursor-gpt-link/switch-version.py" official
```

如果进程被中断并留下 `operation.json`，`./cursor-macos recover` 会使用操作日志恢复此前应用、配置和安装记录。历史应用与失败现场保留在 `backups` 中，脚本不会自动清理。

## Cursor 升级流程

补丁版关闭自动更新，避免后台覆盖补丁。常用流程为：

1. Cursor 退出后，通过 `./cursor-macos official` 回到官方版。
2. 在官方版完成升级并退出。
3. 运行 `./sync-upstream` 同步上游。此命令会重新应用本 fork 的提交、运行回归测试，并推送到自己的 fork。
4. 运行 `./cursor-macos install` 为新版本安装补丁。

如果应用已被新版官方包替换，安装命令会验证新应用的签名与指纹，归档旧安装记录，生成新版本专属备份。旧版本的 manifest 和原始文件不会被用于恢复新版本。

上游新增 Windows 支持不代表 macOS 已验证。出现 `Unsupported Cursor version`、平台不匹配或指纹不匹配时，本次安装保持原状；需要为该 macOS 构建补充指纹、验证符号表和 `scripts/verify-build.mjs` 后再运行。脚本不会自动信任未知二进制。

同版本刷新补丁会保留已有的 workbench 背景 HTML。第三方扩展在启动后修改应用资源，可能影响后续完整性校验；该情况需要检查具体变化，脚本不会跳过哈希验证。

## 保留的功能

| 功能 | 行为 |
| --- | --- |
| Fast | 转发 `service_tier: priority` 和 `x-codex-routing-hint`，路由字段位于大输入之前；普通模式不请求 priority |
| Context | 第一项来自当前模型目录的 `context_window`，显示 `Codex default`；默认低于 500K 且目录允许时，增加 500K；相同值只显示一次 |
| Reasoning | 保留模型支持的推理强度；切换上下文不清除 Fast 或推理强度 |
| Cursor 3.24 发送 | `chatgpt-codex/` 模型进入本地 agent-exec，并确保 Agent Host 激活时注册本地 provider |
| 普通模型 | 保持 Cursor 原生执行策略 |
| 官方恢复 | 切换完整的、经 codesign 验证的官方应用；恢复原自动更新配置 |
| 本机 bridge | 本地认证、自动启动、已有 Codex 登录；不上传账号文件到仓库 |

Fast 是否获得优先处理由服务端决定，代码保留真实返回的 tier，不保证固定倍率。2026-10-14 的本地 UI 验证完成 GPT-6.1-Sol Very high + Fast 的文件写入和读取；长输出速度基准未在此次仓库整理中重跑。

上下文来自账户的实时模型目录，数字可能随模型变化。此前验证中 GPT-6.1-Sol 默认已为 500K，其他部分模型默认 272K，因此菜单数量会随模型不同。

该个人 fork 保留企业 Zscaler 环境所需的 TLS 行为：Git 同步通过命令级 `GIT_SSL_NO_VERIFY=true`，macOS bridge 的子进程禁用 Node TLS 校验。此设置不修改系统证书、全局 Git 配置或其他 Node 进程。

## 上游同步与验证

```sh
./sync-upstream             # rebase、回归检查、带精确 lease 的推送
./sync-upstream --no-push   # rebase 和检查，保留在本地供审阅
npm run test:macos          # JS 测试及 macOS 安装/恢复/同步场景测试
```

同步要求干净的 `main`，并要求本地 HEAD 与 `origin/main` 一致。每次真正 rebase 前创建 `backup/pre-upstream-*` 分支；冲突或测试失败时恢复原分支。推送使用远端 SHA 的 `--force-with-lease`，远端被其他操作更新后会拒绝覆盖。推送失败时保留已经测试的本地结果，需要处理后再次推送。

`origin` 指向自己的 fork，`upstream` 指向 `https://github.com/vertexitde/cursor-gpt-link.git`。定期任务只同步仓库，不关闭 Cursor，也不自动替换运行中的应用。新提交的 footer 使用：

```text
Made-with: Coding Agent
```

仓库只包含补丁源码、指纹与测试；完整 Cursor 应用、认证、bridge 密钥、聊天内容及本地日志都保留在本机。
