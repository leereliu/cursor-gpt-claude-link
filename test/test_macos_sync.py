import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('upstream_sync', Path(__file__).resolve().parents[1] / 'scripts/sync-upstream.py')
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


class RebaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.upstream = self.root / 'upstream.git'
        self.fork = self.root / 'fork.git'
        self.seed = self.root / 'seed'
        self.repo = self.root / 'repo'
        self.env = {**os.environ, 'GIT_AUTHOR_NAME':'Fixture', 'GIT_AUTHOR_EMAIL':'fixture@example.invalid',
                    'GIT_COMMITTER_NAME':'Fixture', 'GIT_COMMITTER_EMAIL':'fixture@example.invalid', 'GIT_TERMINAL_PROMPT':'0'}
        self.git(self.root, 'init', '--bare', '-q', str(self.upstream))
        self.git(self.root, 'init', '--bare', '-q', str(self.fork))
        self.git(self.root, 'init', '-qb', 'main', str(self.seed))
        (self.seed / 'base.txt').write_text('base\n')
        (self.seed / 'scripts').mkdir()
        (self.seed / 'scripts/test-macos.mjs').write_text('process.exit(0);\n')
        self.commit(self.seed, 'baseline')
        self.git(self.seed, 'remote', 'add', 'origin', str(self.upstream))
        self.git(self.seed, 'push', '-q', 'origin', 'main')
        self.git(self.root, 'clone', '-qb', 'main', str(self.upstream), str(self.repo))
        self.git(self.repo, 'remote', 'rename', 'origin', 'upstream')
        self.git(self.repo, 'remote', 'add', 'origin', str(self.fork))
        (self.repo / 'fast.txt').write_text('Fast and context customizations\n')
        self.commit(self.repo, 'local feature\n\nMade-with: Coding Agent')
        self.git(self.repo, 'push', '-qu', 'origin', 'main')
        self.before = self.git(self.repo, 'rev-parse', 'HEAD')
        self.patches = [patch.object(sync, 'REPO', self.repo), patch.object(sync, 'UPSTREAM', str(self.upstream)),
                        patch.object(sync, 'ENV', {**sync.ENV, **self.env})]
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])

    def git(self, directory, *args):
        return subprocess.check_output(['git', *args], cwd=directory, env=self.env, text=True, stderr=subprocess.DEVNULL).strip()

    def commit(self, repo, message):
        self.git(repo, 'add', '.')
        self.git(repo, 'commit', '-qm', message)

    def advance(self, name='upstream.txt', text='upstream\n'):
        (self.seed / name).write_text(text)
        self.commit(self.seed, 'upstream update')
        self.git(self.seed, 'push', '-q', 'origin', 'main')

    def test_rebase_push_preserves_features_and_backup(self):
        self.advance()
        sync.sync()
        head = self.git(self.repo, 'rev-parse', 'HEAD')
        self.assertNotEqual(head, self.before)
        self.assertEqual(self.git(self.fork, 'rev-parse', 'main'), head)
        self.assertTrue((self.repo / 'fast.txt').exists())
        self.assertTrue((self.repo / 'upstream.txt').exists())
        self.assertIn(self.before, self.git(self.repo, 'show-ref'))
        sync.sync()  # no-op when already current

    def test_conflict_aborts_to_original(self):
        (self.repo / 'base.txt').write_text('fork content\n')
        self.commit(self.repo, 'local change')
        self.git(self.repo, 'push', '-q', 'origin', 'main')
        before = self.git(self.repo, 'rev-parse', 'HEAD')
        self.advance('base.txt', 'conflicting upstream content\n')
        with self.assertRaisesRegex(RuntimeError, '已恢复原分支'):
            sync.sync()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), before)
        self.assertEqual(self.git(self.repo, 'status', '--porcelain'), '')
        self.assertEqual(self.git(self.fork, 'rev-parse', 'main'), before)

    def test_regression_failure_rolls_back_without_push(self):
        self.advance('scripts/test-macos.mjs', 'process.exit(1);\n')
        with self.assertRaisesRegex(RuntimeError, '回归测试失败'):
            sync.sync()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual(self.git(self.fork, 'rev-parse', 'main'), self.before)

    def test_dirty_or_remote_ahead_refuses_to_overwrite(self):
        (self.repo / 'draft.txt').write_text('user work\n')
        with self.assertRaisesRegex(RuntimeError, '未提交改动'):
            sync.sync()
        (self.repo / 'draft.txt').unlink()
        self.advance()
        self.git(self.seed, 'push', '-q', '--force', str(self.fork), 'main')
        remote = self.git(self.fork, 'rev-parse', 'main')
        with self.assertRaisesRegex(RuntimeError, 'origin/main 不一致'):
            sync.sync()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual(self.git(self.fork, 'rev-parse', 'main'), remote)


if __name__ == '__main__':
    unittest.main()
