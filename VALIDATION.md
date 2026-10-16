# 验证记录

日期：2026-10-16。

环境：macOS 15.7.3 arm64，Cursor 3.24.12，Claude Code 2.1.300。

- 源项目测试、组合运行测试：通过。
- Cursor 官方备份签名及六个文件指纹：通过。
- desktop/glass 实际补丁语法、Agent Host 路由、provider 注册：通过。
- GPT Fast、Reasoning、Context；Claude Effort、Context；工具继承与生命周期：实际原始 JavaScript 检查通过。
- 本机安装、实际请求、UI 工具操作、官方版往返切换：待验收。

不将静态检查表述为模型实际调用成功；验收完成后更新此记录。
