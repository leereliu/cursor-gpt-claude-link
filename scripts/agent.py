#!/usr/bin/env python3
"""Run Cursor's local CLI harness against the installed Claude subscription bridge."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from macos import STATE, node_binary, read

CLI_VERSION = '2026.10.22-27dcf5f'
DEFAULT_MODEL = 'claude-subscription/claude-opus-5-5'
CLI_SOURCE_SHA256 = '2bf2d57356961a9690c5f1e8b4bfc48e1cae93c50a147230587c4879bcdee7f4'


def patch_cli_source(source):
    # Local CLI drops saved parameters and can infer before catalog discovery.
    replacements = [
        ('async awaitCurrentModelWithStartupCache(){return this.currentModel}async awaitCurrentModel(){return this.currentModel}',
         'async awaitCurrentModelWithStartupCache(){await this.modelFetchPromise;return this.currentModel}async awaitCurrentModel(){await this.modelFetchPromise;return this.currentModel}'),
        ('async setModelFromStoredId(e,t){return!!e?.trim()&&(await this.setCurrentModelWithParameters(e.trim(),[],t),!0)}',
         'async setModelFromStoredId(e,t){return!!e?.trim()&&(await this.setCurrentModelWithParameters(e.trim(),this.getParametersForModel(e.trim(),t),t),!0)}')
    ]
    for before, after in replacements:
        if source.count(before) != 1:
            raise ValueError('Cursor local CLI 补丁锚点不唯一，操作取消。')
        source = source.replace(before, after)
    return source


def patched_cli(cli):
    original = cli.parent / 'index.js'
    source = original.read_bytes()
    if hashlib.sha256(source).hexdigest() != CLI_SOURCE_SHA256:
        raise ValueError('Cursor local CLI 指纹不匹配，操作取消。')
    patched = patch_cli_source(source.decode())
    target = cli.parent / 'index.opus55-high.js'
    if not target.exists() or target.read_text() != patched:
        fd, temporary = tempfile.mkstemp(dir=cli.parent, prefix='index.opus55-high-', suffix='.js')
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(patched)
            subprocess.run([str(cli.parent / 'node'), '--check', temporary], check=True, capture_output=True)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return target


def cli_arguments(args):
    if '--list-models' in args:
        raise ValueError('此版本本地 CLI 的 --list-models 会访问 Cursor 后端，暂不支持；固定使用 Claude 订阅 Opus 5.5 High。')
    for arg in args:
        if arg == '--model' or arg.startswith('--model='):
            raise ValueError('此 CLI 固定使用 Claude 订阅 Opus 5.5 High，不能覆盖模型与推理强度。')
        if arg.split('=', 1)[0] in ['--base-url', '--local-agent-api-key', '--endpoint', '-e',
                                    '--agent-endpoint', '--enable-bedrock', '--enable-local-bedrock']:
            raise ValueError('此入口固定使用本机 Claude 订阅 bridge，不能覆盖推理路由。')
    return ['--authless', *args]


def pinned_config(original):
    parameters = [{'id': 'reasoning', 'value': 'high'}]
    return {**original, 'model': {'modelId': DEFAULT_MODEL, 'displayModelId': DEFAULT_MODEL,
            'displayName': 'Claude Opus 5.5', 'displayNameShort': 'Opus 5.5', 'aliases': []},
            'selectedModel': {'modelId': DEFAULT_MODEL, 'parameters': parameters},
            'modelParameters': {**original.get('modelParameters', {}), DEFAULT_MODEL: parameters},
            'hasChangedDefaultModel': True, 'maxMode': False, 'exploreSubagentModel': 'inherit',
            'subagentModels': {**original.get('subagentModels', {}), 'explore': 'inherit'}}


def prepare_profile(source):
    config_dir = Path(source.get('CURSOR_CONFIG_DIR') or source.get('CURSOR_DATA_DIR') or Path.home() / '.cursor')
    original = config_dir / 'cli-config.json'
    cfg = pinned_config(read(original) if original.exists() else {})
    profile = STATE / 'cli-opus55-high'
    profile.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=profile, prefix='cli-config-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(cfg, stream)
        os.replace(temporary, profile / 'cli-config.json')
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return profile


def cli_environment(cfg, source):
    port = cfg.get('claudePort')
    if type(port) is not int or not 1 <= port <= 65535 or not isinstance(cfg.get('key'), str) or not cfg['key']:
        raise ValueError('Claude bridge 配置无效，需要先运行 ./cursor-link install。')
    env = {k: v for k, v in source.items() if k not in ['ELECTRON_RUN_AS_NODE', 'CURSOR_ENABLE_BEDROCK',
           'CURSOR_ENABLE_LOCAL_BEDROCK', 'CURSOR_LOCAL_AGENT_API_KEY_HELPER']}
    env.update(CURSOR_LOCAL_AGENT_BASE_URL=f'http://127.0.0.1:{port}/cli/v1', CURSOR_LOCAL_AGENT_API_KEY=cfg['key'])
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
    env['CURSOR_CONFIG_DIR'] = str(prepare_profile(os.environ))
    env['CURSOR_INVOKED_AS'] = 'cursor-agent-local'
    script = patched_cli(cli)
    os.execve(cli.parent / 'node', [str(cli), '--use-system-ca', str(script), *args], env)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
