#!/usr/bin/env python3
"""Update the GPT base and Claude subtree, verify, then push with an exact lease."""
import argparse
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

REPO = Path(__file__).resolve().parent.parent
SOURCES = {'gpt': 'https://github.com/leereliu/cursor-gpt-link.git',
           'claude': 'https://github.com/leereliu/cursor-claude-link.git'}
ORIGIN = 'https://github.com/leereliu/cursor-gpt-claude-link.git'
ENV = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_EDITOR': 'true'}


def git(*args, capture=False):
    return subprocess.run(['git', *args], cwd=REPO, env=ENV, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def test():
    stable = Path.home() / 'Library/Application Support/cursor-gpt-link/bin/node'
    node = os.environ.get('CURSOR_GPT_LINK_NODE') or (str(stable) if stable.exists() else shutil.which('node'))
    if not node:
        raise RuntimeError('Node.js 22+ is required.')
    subprocess.run([node, 'scripts/test-all.mjs'], cwd=REPO, env=ENV, check=True)


def sync(push=True):
    if git('status', '--porcelain', capture=True).strip():
        raise RuntimeError('Working tree is not clean; source sync stopped.')
    if git('branch', '--show-current', capture=True).strip() != 'main':
        raise RuntimeError('Source sync only maintains main.')
    remotes=git('remote', capture=True).splitlines()
    for remote, expected in {**SOURCES, 'origin': ORIGIN}.items():
        if remote not in remotes and remote in SOURCES:
            git('remote', 'add', remote, expected)
        if git('remote', 'get-url', remote, capture=True).strip().rstrip('/') != expected:
            raise RuntimeError('Unexpected remote: ' + remote)
        git('fetch', remote, 'main')
    before = git('rev-parse', 'HEAD', capture=True).strip()
    lease = git('rev-parse', 'origin/main', capture=True).strip()
    if before != lease:
        raise RuntimeError('Local main differs from origin/main; changes are preserved.')
    source_file = REPO / 'SOURCES.json'
    sources = json.loads(source_file.read_text())
    tips = {name: git('rev-parse', name + '/main', capture=True).strip() for name in SOURCES}
    changed = [name for name, tip in tips.items() if tip != sources[name]['commit']]
    if not changed:
        print('Both sources are current.')
        return
    backup = 'backup/pre-sources-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    git('branch', backup, before)
    try:
        if 'gpt' in changed:
            # Retain subtree merge strategy/history. Recreating its merge with
            # rebase --rebase-merges incorrectly moves Claude files to the root.
            # The source GPT fork independently rebases its original upstream.
            git('merge', '--no-edit', 'gpt/main')
        if 'claude' in changed:
            git('subtree', 'merge', '--prefix=claude', '--squash', 'claude/main')
        for name, tip in tips.items():
            sources[name]['commit'] = tip
        source_file.write_text(json.dumps(sources, indent=2) + '\n')
        git('add', 'SOURCES.json')
        git('commit', '-m', 'Record verified source updates', '-m', 'Made-with: Coding Agent')
        test()
    except BaseException:
        subprocess.run(['git', 'rebase', '--abort'], cwd=REPO, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['git', 'merge', '--abort'], cwd=REPO, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Only this script changed the initially clean checkout; the backup ref retains all original commits.
        git('reset', '--hard', before)
        raise RuntimeError('Source integration or tests failed; original main restored. Backup: ' + backup)
    if push:
        git('push', '--force-with-lease=refs/heads/main:' + lease, 'origin', 'HEAD:refs/heads/main')
    print('Both sources integrated and tested. Backup: ' + backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-push', action='store_true')
    args = parser.parse_args()
    lock = Path(git('rev-parse', '--absolute-git-dir', capture=True).strip()) / 'combined-source-sync.lock'
    lock.mkdir()
    try:
        sync(not args.no_push)
    finally:
        lock.rmdir()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
