#!/usr/bin/env python3
"""Portable macOS install/switch manager. Application replacement is journaled."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

STATE = Path(os.environ.get('CURSOR_GPT_LINK_HOME', Path.home() / 'Library/Application Support/cursor-gpt-link'))
APP = Path('/Applications/Cursor.app')
SETTINGS = Path.home() / 'Library/Application Support/Cursor/User/settings.json'
JOURNAL = STATE / 'operation.json'
MANAGED = ['config.json', 'installed.json', 'switch-state.json', 'switch-version.py', 'runtime']


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(temp, path)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def identity(app):
    root = app / 'Contents/Resources/app'
    return read(root / 'package.json')['version'], read(root / 'product.json')['commit']


def checked_official(app):
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', app, capture_output=True)


def checked_patch(app):
    manifest = read(STATE / 'installed.json')
    if identity(app) != (manifest['version'], manifest['commit']):
        raise RuntimeError('Cursor 版本与补丁记录不同；升级后使用 install 重新安装，旧备份将保留。')
    for entry in manifest['files']:
        relative = Path(entry['path']).relative_to(APP)
        if digest(app / relative) != entry['patchedHash']:
            raise RuntimeError('补丁文件发生变化，操作取消：' + str(relative))


def closed():
    commands = subprocess.check_output(['/bin/ps', '-axo', 'comm='], text=True)
    if any(line.strip().startswith(str(APP) + '/Contents/MacOS/') for line in commands.splitlines()):
        raise RuntimeError('Cursor 仍在运行。保存工作并退出 Cursor 后，可以再次运行此命令。')


def setting_tokens(text):
    # Comments and quoted braces do not affect JSONC property nesting.
    pattern = r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|[^\s]'
    return [m for m in re.finditer(pattern, text) if not m.group().startswith(('//', '/*'))]


def update_mode(text, value, change=True):
    tokens = setting_tokens(text)
    if not tokens or tokens[0].group() != '{' or tokens[-1].group() != '}':
        raise RuntimeError('Cursor settings.json 不是 JSONC 对象。')
    depth, found = 0, []
    for i, token in enumerate(tokens):
        raw = token.group()
        if raw in ['{', '[']:
            depth += 1
        elif raw in ['}', ']']:
            depth -= 1
        elif depth == 1 and raw == '"update.mode"' and tokens[i + 1].group() == ':':
            found.append(i)
    if len(found) > 1:
        raise RuntimeError('update.mode 配置重复，操作取消。')
    if found:
        i = found[0]
        old = json.loads(tokens[i + 2].group())
        if not isinstance(old, str):
            raise RuntimeError('update.mode 必须是字符串。')
        if not change:
            return old
        if value is not None:
            token = tokens[i + 2]
            return text[:token.start()] + json.dumps(value) + text[token.end():]
        start, end = tokens[i].start(), tokens[i + 2].end()
        if tokens[i + 3].group() == ',':
            end = tokens[i + 3].end()
        elif tokens[i - 1].group() == ',':
            start = tokens[i - 1].start()
        return text[:start] + text[end:]
    if not change:
        return None
    if value is None:
        return text
    pos = tokens[0].end()
    comma = ',' if tokens[1].group() != '}' else ''
    return text[:pos] + '\n  "update.mode": ' + json.dumps(value) + comma + text[pos:]


def configure(mode, meta):
    original = SETTINGS.read_text() if SETTINGS.exists() else '{}\n'
    value = 'none' if mode == 'patched' else meta['originalUpdateMode']
    changed = update_mode(original, value)
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    temp = SETTINGS.with_name('settings.cursor-gpt-link.tmp')
    temp.write_text(changed)
    os.replace(temp, SETTINGS)


def stop_bridge():
    expected = str(STATE / 'bin/node') + ' ' + str(STATE / 'runtime/bridge.mjs')
    pids = []
    for line in subprocess.check_output(['/bin/ps', '-axo', 'pid=,command='], text=True).splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[1] == expected:
            pid = int(parts[0])
            try:
                os.kill(pid, signal.SIGTERM)
                pids.append(pid)
            except ProcessLookupError:
                pass
    for _ in range(50):
        alive = []
        for pid in pids:
            try:
                os.kill(pid, 0)
                alive.append(pid)
            except ProcessLookupError:
                pass
        if not alive:
            return
        pids = alive
        time.sleep(0.1)
    raise RuntimeError('旧 bridge 未退出，操作取消。')


def register():
    binary = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    subprocess.run([binary, '-f', str(APP)], capture_output=True)


def snapshot(kind, target=None):
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup = STATE / 'backups' / ('macos-' + kind + '-' + stamp)
    backup.mkdir(parents=True)
    for name in MANAGED:
        source = STATE / name
        if source.is_dir():
            shutil.copytree(source, backup / name)
        elif source.exists():
            shutil.copy2(source, backup / name)
    if SETTINGS.exists():
        shutil.copy2(SETTINGS, backup / 'settings.json')
    operation = {'backup': str(backup), 'target': str(target) if target else None,
                 'previous': str(backup / 'previous.app.saved'), 'moves': []}
    write(JOURNAL, operation)
    return operation


def move_recorded(operation, source, destination):
    if destination.exists():
        raise RuntimeError('目标已经存在：' + str(destination))
    # Persist intent first: recover can undo a rename even after abrupt termination.
    operation['moves'].append([str(source), str(destination)])
    write(JOURNAL, operation)
    source.rename(destination)


def recover():
    closed()
    operation = read(JOURNAL)
    backup = Path(operation['backup'])
    for source, destination in reversed(operation['moves']):
        source, destination = Path(source), Path(destination)
        if destination.exists():
            if source.exists():
                raise RuntimeError('恢复目标存在，请保留现场检查：' + str(source))
            destination.rename(source)
    for name in MANAGED:
        live, saved = STATE / name, backup / name
        if live.is_dir():
            shutil.rmtree(live)
        elif live.exists():
            live.unlink()
        if saved.is_dir():
            shutil.copytree(saved, live)
        elif saved.exists():
            shutil.copy2(saved, live)
    if (backup / 'settings.json').exists():
        shutil.copy2(backup / 'settings.json', SETTINGS)
    elif SETTINGS.exists():
        SETTINGS.unlink()
    JOURNAL.rename(backup / 'operation.recovered.json')
    register()
    print('已恢复操作前的应用、设置和补丁记录；失败现场与备份保留在 ' + str(backup))


def switch(action):
    meta = read(STATE / 'switch-state.json')
    current = meta['active']
    (checked_patch if current == 'patched' else checked_official)(APP)
    if action == current:
        print('当前已使用 ' + action + ' 版本。')
        return
    closed()
    target = STATE / 'inactive' / (action + '.app.saved')
    saved = STATE / 'inactive' / (current + '.app.saved')
    (checked_patch if action == 'patched' else checked_official)(target)
    if saved.exists():
        raise RuntimeError('备份位置已占用，操作取消：' + str(saved))
    operation = snapshot('switch', target)
    try:
        move_recorded(operation, APP, saved)
        move_recorded(operation, target, APP)
        configure(action, meta)
        meta['active'] = action
        write(STATE / 'switch-state.json', meta)
        if action == 'official':
            stop_bridge()
        JOURNAL.rename(Path(operation['backup']) / 'operation.completed.json')
    except BaseException:
        recover()
        raise
    register()
    print('已切换到 ' + action + ' 版本。官方版恢复原自动更新设置，补丁版关闭自动更新。')


def node_binary():
    candidates = [STATE / 'bin/node', Path(shutil.which('node') or '/missing-node')]
    for candidate in candidates:
        if candidate.exists():
            version = subprocess.check_output([str(candidate), '-p', 'process.versions.node'], text=True).strip()
            if int(version.split('.')[0]) >= 22:
                return candidate
    raise RuntimeError('需要 Node.js 22 或更新版本。')


def install(repo, check_only=False):
    node = node_binary()
    meta_path = STATE / 'switch-state.json'
    meta = read(meta_path) if meta_path.exists() else {}
    version, commit = identity(APP)
    manifest_path = STATE / 'installed.json'
    manifest = read(manifest_path) if manifest_path.exists() else {}
    # A changed build can only become the new baseline after signature + hash checks.
    current_is_patch = meta.get('active') == 'patched' and (version, commit) == (manifest.get('version'), manifest.get('commit'))
    if current_is_patch:
        checked_patch(APP)
        original = STATE / 'inactive/official.app.saved'
    else:
        original = APP
    checked_official(original)
    if identity(original) != (version, commit):
        raise RuntimeError('官方备份与当前 Cursor 版本不同，安装取消。')
    root = original / 'Contents/Resources/app'
    run(node, repo / 'patcher.mjs', 'check', '--cursor-root', root)
    run(node, repo / 'scripts/verify-build.mjs', root)
    if check_only:
        print('原始应用签名、指纹、补丁生成和功能检查通过；未修改安装。')
        return
    closed()
    cfg_path = STATE / 'config.json'
    cfg = read(cfg_path) if cfg_path.exists() else {}
    codex = cfg.get('codex') or shutil.which('codex')
    if not codex or not os.access(codex, os.X_OK):
        raise RuntimeError('找不到 Codex CLI，请安装并完成 codex login。')
    codex_home = Path(cfg.get('codexHome') or os.environ.get('CODEX_HOME', Path.home() / '.codex'))
    if not (codex_home / 'auth.json').exists() or not (codex_home / 'models_cache.json').exists():
        raise RuntimeError('需要现有 Codex 登录和模型目录；请先启动一次 Codex。')
    original_mode = meta.get('originalUpdateMode', update_mode(SETTINGS.read_text() if SETTINGS.exists() else '{}', None, False))
    stop_bridge()
    operation = snapshot('install')
    backup = Path(operation['backup'])
    candidate = backup / 'candidate.app'
    try:
        run('/usr/bin/ditto', original, candidate)
        # Same-build background extension customization survives a patch refresh.
        html = Path('Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html')
        if current_is_patch and (APP / html).exists():
            shutil.copy2(APP / html, candidate / html)
        stable_node = STATE / 'bin/node'
        stable_node.parent.mkdir(parents=True, exist_ok=True)
        if node.resolve() != stable_node.resolve():
            shutil.copy2(node.resolve(), stable_node)
        if manifest_path.exists():
            manifest_path.unlink()  # original manifest is already in this operation's snapshot
        env = {**os.environ, 'CURSOR_GPT_LINK_HOME': str(STATE)}
        candidate_root = candidate / 'Contents/Resources/app'
        run(stable_node, repo / 'patcher.mjs', 'install', '--cursor-root', candidate_root,
            '--codex-path', codex, '--codex-home', codex_home, '--port', cfg.get('port', 43187), env=env)
        updated = read(manifest_path)
        for entry in updated['files']:
            entry['path'] = str(APP / Path(entry['path']).relative_to(candidate))
        write(manifest_path, updated)
        checked_patch(candidate)
        inactive = STATE / 'inactive'
        inactive.mkdir(exist_ok=True)
        old_patch = inactive / 'patched.app.saved'
        if old_patch.exists():
            move_recorded(operation, old_patch, backup / 'older-patched.app.saved')
        official = inactive / 'official.app.saved'
        if not current_is_patch:
            if official.exists():
                move_recorded(operation, official, backup / 'older-official.app.saved')
            move_recorded(operation, APP, official)
        else:
            move_recorded(operation, APP, Path(operation['previous']))
        move_recorded(operation, candidate, APP)
        checked_patch(APP)
        checked_official(official)
        revision = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
        meta.update(active='patched', version=version, commit=commit, originalUpdateMode=original_mode,
                    sourceRepo=str(repo), sourceRevision=revision, officialBackup=str(official))
        configure('patched', meta)
        write(meta_path, meta)
        if Path(__file__).resolve() != (STATE / 'switch-version.py').resolve():
            shutil.copy2(Path(__file__), STATE / 'switch-version.py')
        JOURNAL.rename(backup / 'operation.completed.json')
    except BaseException:
        recover()
        raise
    register()
    print('Cursor ' + version + ' 补丁已安装，Fast、模型默认上下文与 500K 选项已保留。')
    print('官方版入口：python3 "' + str(STATE / 'switch-version.py') + '" official')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'check', 'status', 'official', 'patched', 'recover', 'configure'], nargs='?', default='status')
    parser.add_argument('--repo', type=Path)
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('此入口仅用于 macOS；Windows 使用原有 patcher.mjs。')
    if JOURNAL.exists() and args.action != 'recover':
        raise RuntimeError('发现未完成操作。使用 recover 恢复后可继续，记录位于 ' + str(JOURNAL))
    if args.action == 'recover':
        recover()
    elif args.action in ['install', 'check']:
        repo = args.repo or Path(__file__).resolve().parent.parent
        if not (repo / 'patcher.mjs').exists():
            repo = Path(read(STATE / 'switch-state.json')['sourceRepo'])
        install(repo.resolve(), args.action == 'check')
    elif args.action == 'status':
        meta = read(STATE / 'switch-state.json')
        (checked_patch if meta['active'] == 'patched' else checked_official)(APP)
        other = 'official' if meta['active'] == 'patched' else 'patched'
        backup = STATE / 'inactive' / (other + '.app.saved')
        (checked_official if other == 'official' else checked_patch)(backup)
        print(json.dumps({'active': meta['active'], 'version': identity(APP)[0], 'app': str(APP), 'backupVerified': other,
                          'sourceRevision': meta.get('sourceRevision'), 'restoreCommand': 'python3 "' + str(STATE / 'switch-version.py') + '" official'}, ensure_ascii=False, indent=2))
    elif args.action == 'configure':
        meta = read(STATE / 'switch-state.json')
        configure(meta['active'], meta)
    else:
        switch(args.action)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
