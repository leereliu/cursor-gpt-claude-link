import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('macos_manager', Path(__file__).resolve().parents[1] / 'scripts/macos.py')
mac = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mac)


class SettingsTests(unittest.TestCase):
    def test_jsonc_and_original_mode_roundtrip(self):
        samples = [
            '{}', '{"editor.fontSize": 14}', '{"update.mode":"default"}',
            '{"a":true,"update.mode":"manual"}',
            '{"update.mode":"start","a":[]}',
            '{\n// keep a comment\n"a":"{ \\\"hi\\\" }",\n"update.mode":"default",\n}',
            '{"nested":{"update.mode":"default"},"a":1}',
        ]
        for text in samples:
            with self.subTest(text=text):
                old = mac.update_mode(text, None, False)
                modified = mac.update_mode(text, 'none')
                self.assertEqual(mac.update_mode(modified, None, False), 'none')
                restored = mac.update_mode(modified, old)
                self.assertEqual(mac.update_mode(restored, None, False), old)
                for value in [text, modified, restored]:
                    cleaned = ''.join(token.group() for token in mac.setting_tokens(value))
                    self.assertIsInstance(json.loads(cleaned.replace(',}', '}')), dict)
        with self.assertRaises(RuntimeError):
            mac.update_mode('{"update.mode":"default","update.mode":"none"}', 'none')


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.state = self.base / 'state'
        self.app = self.base / 'Applications/Cursor.app'
        self.settings = self.base / 'User/settings.json'
        self.settings.parent.mkdir()
        self.settings.write_text('{"editor.fontSize": 14}\n')
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        subprocess.run(['git', '-C', str(self.repo), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], check=True)
        self.patches = [patch.object(mac, 'STATE', self.state), patch.object(mac, 'APP', self.app),
                        patch.object(mac, 'SETTINGS', self.settings), patch.object(mac, 'JOURNAL', self.state / 'operation.json'),
                        patch.object(mac, 'closed'), patch.object(mac, 'stop_bridge'), patch.object(mac, 'register'),
                        patch.object(mac, 'checked_official', side_effect=self.official), patch.object(mac, 'run', side_effect=self.fake_run)]
        for p in self.patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])
        self.addCleanup(self.temp.cleanup)
        self.make_app(self.app, '3.24.12', 'a')
        self.state.mkdir()
        codex = self.base / 'codex'
        codex.write_text('#!/bin/sh\nexit 0\n')
        codex.chmod(0o755)
        auth = self.base / 'codex-home'
        auth.mkdir()
        (auth / 'auth.json').write_text('{}')
        (auth / 'models_cache.json').write_text('{}')
        mac.write(self.state / 'config.json', {'codex': str(codex), 'codexHome': str(auth), 'port': 43187})
        node = self.state / 'bin/node'
        node.parent.mkdir()
        node.write_text('#!/bin/sh\necho 24.0.0\n')
        node.chmod(0o755)

    def make_app(self, app, version, commit):
        root = app / 'Contents/Resources/app'
        root.mkdir(parents=True)
        mac.write(root / 'package.json', {'version': version})
        mac.write(root / 'product.json', {'commit': commit})
        (root / 'main.js').write_text('original-' + version)

    def official(self, app):
        if not (app / 'Contents/Resources/app/main.js').read_text().startswith('original-'):
            raise RuntimeError('signature verification failed')

    def fake_run(self, *args, **kwargs):
        args = [str(a) for a in args]
        if args[0] == '/usr/bin/ditto':
            shutil.copytree(args[1], args[2])
        elif args[1].endswith('patcher.mjs') and args[2] == 'install':
            root = Path(args[args.index('--cursor-root') + 1])
            target = root / 'main.js'
            original = self.state / ('original-' + mac.identity(root.parents[2])[0])
            shutil.copy2(target, original)
            target.write_text('patched-' + mac.identity(root.parents[2])[0])
            version, commit = mac.identity(root.parents[2])
            mac.write(self.state / 'installed.json', {'version': version, 'commit': commit, 'files': [
                {'path': str(target), 'backup': str(original), 'originalHash': mac.digest(original), 'patchedHash': mac.digest(target)}]})
            (self.state / 'runtime').mkdir(exist_ok=True)
            (self.state / 'runtime/bridge.mjs').write_text('new runtime')
        return subprocess.CompletedProcess(args, 0)

    def test_install_and_both_switch_directions(self):
        mac.install(self.repo)
        mac.checked_patch(self.app)
        self.official(self.state / 'inactive/official.app.saved')
        self.assertEqual(mac.update_mode(self.settings.read_text(), None, False), 'none')
        mac.switch('official')
        self.official(self.app)
        self.assertIsNone(mac.update_mode(self.settings.read_text(), None, False))
        mac.switch('patched')
        mac.checked_patch(self.app)
        self.assertFalse(mac.JOURNAL.exists())

    def test_same_build_refresh_and_new_official_upgrade(self):
        mac.install(self.repo)
        mac.install(self.repo)
        mac.checked_patch(self.app)
        mac.switch('official')
        shutil.rmtree(self.app)
        self.make_app(self.app, '3.25.0', 'b')
        mac.install(self.repo)
        mac.checked_patch(self.app)
        self.assertEqual(mac.identity(self.state / 'inactive/official.app.saved'), ('3.25.0', 'b'))
        preserved = list((self.state / 'backups').glob('*/older-patched.app.saved'))
        self.assertEqual(mac.identity(preserved[0]), ('3.24.12', 'a'))
        mac.switch('official')
        self.assertEqual(mac.identity(self.app), ('3.25.0', 'b'))

    def test_failure_after_replacement_restores_app_and_state(self):
        original_cfg = (self.state / 'config.json').read_bytes()
        original_settings = self.settings.read_bytes()
        with patch.object(mac, 'configure', side_effect=RuntimeError('simulated disk failure')):
            with self.assertRaisesRegex(RuntimeError, 'simulated disk failure'):
                mac.install(self.repo)
        self.official(self.app)
        self.assertEqual((self.state / 'config.json').read_bytes(), original_cfg)
        self.assertEqual(self.settings.read_bytes(), original_settings)
        self.assertFalse((self.state / 'installed.json').exists())
        self.assertFalse(mac.JOURNAL.exists())

    def test_crash_journal_and_version_mismatch(self):
        mac.install(self.repo)
        root = self.app / 'Contents/Resources/app'
        mac.write(root / 'package.json', {'version': '9.0.0'})
        with self.assertRaisesRegex(RuntimeError, '版本与补丁记录'):
            mac.checked_patch(self.app)
        mac.write(root / 'package.json', {'version': '3.24.12'})
        operation = mac.snapshot('interrupted')
        mac.move_recorded(operation, self.app, Path(operation['previous']))
        self.assertFalse(self.app.exists())
        mac.recover()
        mac.checked_patch(self.app)

    def test_unsigned_or_mismatched_backup_rejected_before_mutation(self):
        mac.install(self.repo)
        before = (self.state / 'installed.json').read_bytes()
        official = self.state / 'inactive/official.app.saved'
        mac.write(official / 'Contents/Resources/app/package.json', {'version': '9.0.0'})
        with self.assertRaisesRegex(RuntimeError, '官方备份与当前'):
            mac.install(self.repo)
        self.assertEqual(before, (self.state / 'installed.json').read_bytes())
        self.assertFalse(mac.JOURNAL.exists())


if __name__ == '__main__':
    unittest.main()
