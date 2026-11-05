import sys
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from agent import cli_arguments, cli_environment, ensure_bridge


class AgentCliTests(unittest.TestCase):
    def test_defaults_to_subscription_opus_and_preserves_cursor_arguments(self):
        self.assertEqual(cli_arguments(['--print', 'hello']),
                         ['--authless', '--model', 'claude-subscription/opus', '--print', 'hello'])
        self.assertEqual(cli_arguments(['--model=claude-subscription/sonnet', 'hello']),
                         ['--authless', '--model=claude-subscription/sonnet', 'hello'])

    def test_local_credentials_stay_in_environment_and_provider_fallback_is_removed(self):
        source = {'PATH': 'fixture', 'CURSOR_ENABLE_BEDROCK': '1', 'CURSOR_ENABLE_LOCAL_BEDROCK': '1',
                  'CURSOR_LOCAL_AGENT_API_KEY_HELPER': '/unused', 'ELECTRON_RUN_AS_NODE': '1'}
        env = cli_environment({'claudePort': 43188, 'key': 'fixture-local-secret'}, source)
        self.assertEqual(env, {'PATH': 'fixture', 'CURSOR_LOCAL_AGENT_BASE_URL': 'http://127.0.0.1:43188/v1',
                              'CURSOR_LOCAL_AGENT_API_KEY': 'fixture-local-secret'})
        self.assertNotIn('fixture-local-secret', ' '.join(cli_arguments([])))
        self.assertEqual(source['CURSOR_ENABLE_BEDROCK'], '1')

    def test_rejects_invalid_bridge_settings_and_routing_overrides(self):
        for cfg in [{'claudePort': '43188', 'key': 'key'}, {'claudePort': 43188, 'key': ''}]:
            with self.assertRaises(ValueError):
                cli_environment(cfg, {})
        for option in ['--base-url=https://example.com', '--enable-bedrock', '--endpoint', '-e']:
            with self.assertRaises(ValueError):
                cli_arguments([option])
        with self.assertRaisesRegex(ValueError, '--list-models'):
            cli_arguments(['--list-models'])

    def test_starts_the_installed_worker_when_the_ide_is_closed(self):
        opener = Mock()
        opener.open.side_effect = [urllib.error.URLError('refused'), io.BytesIO(b'{"provider":"claude-subscription"}')]
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'runtime').mkdir()
            (state / 'runtime/bridge.mjs').touch()
            with patch('agent.STATE', state), patch('agent.node_binary', return_value=Path('/fixture/node')), \
                    patch('agent.urllib.request.build_opener', return_value=opener), patch('agent.subprocess.Popen') as spawn:
                ensure_bridge({'claudePort': 43188, 'key': 'fixture-key'})
                self.assertEqual(spawn.call_count, 1)
                self.assertEqual(spawn.call_args.args[0], ['/fixture/node', str(state / 'runtime/bridge.mjs')])
                self.assertTrue(spawn.call_args.kwargs['start_new_session'])

    def test_auth_failure_does_not_restart_or_replace_an_existing_bridge(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError('http://127.0.0.1', 401, 'Unauthorized', {}, None)
        with patch('agent.urllib.request.build_opener', return_value=opener), patch('agent.subprocess.Popen') as spawn:
            with self.assertRaisesRegex(RuntimeError, '鉴权失败'):
                ensure_bridge({'claudePort': 43188, 'key': 'fixture-key'})
            spawn.assert_not_called()
