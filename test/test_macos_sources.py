import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_sync', Path(__file__).resolve().parents[1] / 'scripts/sync-sources.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SourceSyncTests(unittest.TestCase):
    def git(self, cwd, *args):
        return subprocess.check_output(['git', *args], cwd=cwd, env=self.env, text=True, stderr=subprocess.DEVNULL).strip()

    def commit(self, repo, message):
        self.git(repo, 'add', '.')
        self.git(repo, 'commit', '-qm', message)

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.env = {**os.environ, 'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid', 'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid', 'GIT_TERMINAL_PROMPT': '0'}
        self.seeds = {}
        sources = {}
        for name in ['gpt', 'claude']:
            repo = self.root / name
            self.git(self.root, 'init', '-qb', 'main', str(repo))
            (repo / 'base.txt').write_text(name)
            if name == 'gpt':
                (repo / 'scripts').mkdir()
                (repo / 'scripts/test-all.mjs').write_text('process.exit(0)')
            self.commit(repo, name + ' baseline')
            sources[name] = str(repo)
            self.seeds[name] = repo
        self.repo = self.root / 'combined'
        self.git(self.root, 'clone', '-qb', 'main', sources['gpt'], str(self.repo))
        self.git(self.repo, 'remote', 'rename', 'origin', 'gpt')
        self.git(self.repo, 'remote', 'add', 'claude', sources['claude'])
        self.git(self.repo, 'subtree', 'add', '--prefix=claude', 'claude', 'main', '--squash')
        (self.repo / 'SOURCES.json').write_text(json.dumps({name: {'commit': self.git(repo, 'rev-parse', 'HEAD')} for name, repo in self.seeds.items()}))
        (self.repo / 'fast.txt').write_text('local feature')
        self.commit(self.repo, 'combined feature')
        self.origin = self.root / 'origin.git'
        self.git(self.root, 'init', '--bare', '-q', str(self.origin))
        self.git(self.repo, 'remote', 'add', 'origin', str(self.origin))
        self.git(self.repo, 'push', '-qu', 'origin', 'main')
        self.before = self.git(self.repo, 'rev-parse', 'HEAD')
        for key, value in [('REPO', self.repo), ('SOURCES', sources), ('ORIGIN', str(self.origin)), ('ENV', {**sync.ENV, **self.env})]:
            p = patch.object(sync, key, value)
            p.start()
            self.addCleanup(p.stop)

    def advance(self, source, file='new.txt', text='source update'):
        repo = self.seeds[source]
        (repo / file).write_text(text)
        self.commit(repo, 'source update')

    def test_both_sources_update_without_losing_features(self):
        self.advance('gpt')
        self.advance('claude')
        sync.sync()
        for file in ['new.txt', 'claude/new.txt', 'fast.txt']:
            self.assertTrue((self.repo / file).exists())
        head = self.git(self.repo, 'rev-parse', 'HEAD')
        self.assertEqual(self.git(self.origin, 'rev-parse', 'main'), head)
        self.assertIn(self.before, self.git(self.repo, 'show-ref'))
        sources = json.loads((self.repo / 'SOURCES.json').read_text())
        for name, repo in self.seeds.items():
            self.assertEqual(sources[name]['commit'], self.git(repo, 'rev-parse', 'HEAD'))
        sync.sync()
        self.assertEqual(head, self.git(self.repo, 'rev-parse', 'HEAD'))

    def test_failed_tests_restore_both_integrations(self):
        self.advance('gpt', 'scripts/test-all.mjs', 'process.exit(1)')
        self.advance('claude')
        with self.assertRaisesRegex(RuntimeError, 'original main restored'):
            sync.sync()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual(self.git(self.origin, 'rev-parse', 'main'), self.before)
        self.assertEqual(self.git(self.repo, 'status', '--porcelain'), '')

    def test_dirty_worktree_stops_without_changes(self):
        (self.repo / 'user.txt').write_text('uncommitted work')
        with self.assertRaisesRegex(RuntimeError, 'not clean'):
            sync.sync()
        self.assertEqual((self.repo / 'user.txt').read_text(), 'uncommitted work')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
