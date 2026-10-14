#!/usr/bin/env python3
"""Rebase this fork on upstream/main, test, then push using an exact lease."""
import argparse
import datetime
import os
from pathlib import Path
import subprocess
import sys

REPO = Path(__file__).resolve().parent.parent
ENV = {**os.environ, 'GIT_SSL_NO_VERIFY': 'true', 'GIT_TERMINAL_PROMPT': '0', 'GIT_EDITOR': 'true'}
UPSTREAM = 'https://github.com/vertexitde/cursor-gpt-link.git'


def git(*args, capture=False):
    return subprocess.run(['git', *args], cwd=REPO, env=ENV, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def sync(push=True):
    if git('status', '--porcelain', capture=True).strip():
        raise RuntimeError('工作区存在未提交改动，上游同步已取消。')
    branch = git('branch', '--show-current', capture=True).strip()
    if branch != 'main':
        raise RuntimeError('同步入口只维护 main，当前分支是 ' + branch)
    upstream = git('remote', 'get-url', 'upstream', capture=True).strip()
    origin = git('remote', 'get-url', 'origin', capture=True).strip()
    if upstream.rstrip('/') != UPSTREAM or 'vertexitde/cursor-gpt-link' in origin:
        raise RuntimeError('远程配置不符合 fork 同步要求。')
    git('fetch', 'upstream', 'main')
    git('fetch', 'origin', 'main')
    before = git('rev-parse', 'HEAD', capture=True).strip()
    lease = git('rev-parse', 'refs/remotes/origin/main', capture=True).strip()
    if before != lease:
        raise RuntimeError('本地 main 与 origin/main 不一致，请先处理本地提交或远端变化。')
    upstream_tip = git('rev-parse', 'refs/remotes/upstream/main', capture=True).strip()
    contained = subprocess.run(['git', 'merge-base', '--is-ancestor', upstream_tip, 'HEAD'], cwd=REPO).returncode
    if contained == 0:
        print('上游没有新的提交。')
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = 'refs/heads/backup/pre-upstream-' + stamp
    git('update-ref', backup, before)
    try:
        git('rebase', 'upstream/main')
        # Only repository tests; never stop or patch the user's application here.
        node = os.environ.get('CURSOR_GPT_LINK_NODE', 'node')
        subprocess.run([node, 'scripts/test-macos.mjs'], cwd=REPO, env=ENV, check=True)
    except BaseException:
        rebase_dir = Path(git('rev-parse', '--git-path', 'rebase-merge', capture=True).strip())
        rebase_apply = Path(git('rev-parse', '--git-path', 'rebase-apply', capture=True).strip())
        if (REPO / rebase_dir).exists() or (REPO / rebase_apply).exists():
            git('rebase', '--abort')
        else:
            # This script required a clean tree and all commits are also in backup.
            git('reset', '--hard', before)
        raise RuntimeError('Rebase 或回归测试失败，已恢复原分支。备份：' + backup)
    if push:
        try:
            git('push', '--force-with-lease=refs/heads/main:' + lease, 'origin', 'HEAD:refs/heads/main')
        except subprocess.CalledProcessError:
            # Keep the tested result locally; never override a concurrently updated remote.
            raise RuntimeError('推送失败，本地 rebase 结果和备份均已保留；请检查网络或远端变化。')
    print('上游同步与回归测试完成；备份：' + backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-push', action='store_true')
    args = parser.parse_args()
    lock = REPO / git('rev-parse', '--git-path', 'cursor-gpt-link-sync.lock', capture=True).strip()
    try:
        lock.mkdir()
    except FileExistsError:
        raise RuntimeError('存在同步锁；确认没有其他同步进程后可以检查 ' + str(lock))
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
