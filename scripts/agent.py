#!/usr/bin/env python3
"""Run Cursor's local CLI harness against the installed Claude subscription bridge."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request

from macos import STATE, node_binary, read

CLI_VERSION = '2026.10.22-27dcf5f'
DEFAULT_MODEL = 'claude-subscription/opus'


def cli_arguments(args):
    if '--list-models' in args:
        raise ValueError('此版本本地 CLI 的 --list-models 会访问 Cursor 后端，暂不支持；默认使用 Claude 订阅 Opus。')
    for arg in args:
        if arg.split('=', 1)[0] in ['--base-url', '--local-agent-api-key', '--endpoint', '-e',
                                    '--agent-endpoint', '--enable-bedrock', '--enable-local-bedrock']:
            raise ValueError('此入口固定使用本机 Claude 订阅 bridge，不能覆盖推理路由。')
    model = [] if any(arg == '--model' or arg.startswith('--model=') for arg in args) else ['--model', DEFAULT_MODEL]
    return ['--authless', *model, *args]


def cli_environment(cfg, source):
    port = cfg.get('claudePort')
    if type(port) is not int or not 1 <= port <= 65535 or not isinstance(cfg.get('key'), str) or not cfg['key']:
        raise ValueError('Claude bridge 配置无效，需要先运行 ./cursor-link install。')
    env = {k: v for k, v in source.items() if k not in ['ELECTRON_RUN_AS_NODE', 'CURSOR_ENABLE_BEDROCK',
           'CURSOR_ENABLE_LOCAL_BEDROCK', 'CURSOR_LOCAL_AGENT_API_KEY_HELPER']}
    env.update(CURSOR_LOCAL_AGENT_BASE_URL=f'http://127.0.0.1:{port}/v1', CURSOR_LOCAL_AGENT_API_KEY=cfg['key'])
    return env


def ensure_bridge(cfg):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(f"http://127.0.0.1:{cfg['claudePort']}/health",
                                     headers={'Authorization': 'Bearer ' + cfg['key']})

    def ready():
        try:
            with opener.open(request, timeout=1) as response:
                if json.load(response).get('provider') != 'claude-subscription':
                    raise RuntimeError('本机端口没有返回 Claude subscription bridge。')
                return True
        except urllib.error.HTTPError:
            raise RuntimeError('Claude bridge 鉴权失败，需要检查现有安装。') from None
        except urllib.error.URLError:
            return False

    if ready():
        return
    worker = STATE / 'runtime/bridge.mjs'
    if not worker.exists():
        raise RuntimeError('需要先运行 ./cursor-link install。')
    subprocess.Popen([str(node_binary()), str(worker)], env={**os.environ, 'CURSOR_GPT_LINK_HOME': str(STATE)},
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(30):
        if ready():
            return
        time.sleep(0.1)
    raise RuntimeError('Claude bridge 启动失败，需要检查现有安装。')


def main():
    args = cli_arguments(sys.argv[1:])
    cli = Path.home() / '.local/share/cursor-agent-local/versions' / CLI_VERSION / 'cursor-agent-local'
    if not os.access(cli, os.X_OK):
        raise RuntimeError('缺少 Cursor 官方本地推理 CLI ' + CLI_VERSION + '，安装方法见 README.md。')
    cfg = read(STATE / 'config.json')
    env = cli_environment(cfg, os.environ)
    ensure_bridge(cfg)
    os.execve(cli, [str(cli), *args], env)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
