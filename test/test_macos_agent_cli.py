import sys
import io
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import Mock, patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from agent import DEFAULT_MODEL, cli_arguments, cli_environment, ensure_bridge, patch_cli_source, patched_cli, pinned_config


class AgentCliTests(unittest.TestCase):
    def test_pins_subscription_opus_55_high_and_preserves_cursor_arguments(self):
        self.assertEqual(cli_arguments(['--print', 'hello']),
                         ['--authless', '--print', 'hello'])
        for arg in ['--model', '--model=claude-subscription/sonnet', '--model=claude-subscription/opus[reasoning=low]']:
            with self.assertRaisesRegex(ValueError, 'Opus 5.5 High'):
                cli_arguments([arg])

    def test_profile_preserves_permissions_and_pins_model_effort_and_explore_inheritance(self):
        original = {'approvalMode': 'allowlist', 'permissions': {'deny': ['Shell(rm)']},
                    'selectedModel': {'modelId': 'old', 'parameters': []},
                    'modelParameters': {'old': [{'id': 'reasoning', 'value': 'low'}]},
                    'subagentModels': {'explore': 'old', 'other': 'keep'}, 'exploreSubagentModel': 'default'}
        cfg = pinned_config(original)
        self.assertEqual(cfg['approvalMode'], 'allowlist')
        self.assertEqual(cfg['permissions'], original['permissions'])
        self.assertEqual(cfg['selectedModel'], {'modelId': DEFAULT_MODEL, 'parameters': [{'id': 'reasoning', 'value': 'high'}]})
        self.assertEqual(cfg['modelParameters'][DEFAULT_MODEL], cfg['selectedModel']['parameters'])
        self.assertEqual(cfg['subagentModels'], {'explore': 'inherit', 'other': 'keep'})
        self.assertEqual(cfg['exploreSubagentModel'], 'inherit')
        self.assertEqual(original['selectedModel']['modelId'], 'old')
        self.assertEqual(original['subagentModels']['explore'], 'old')

    def test_native_cli_waits_for_catalog_and_keeps_high_when_restoring_model(self):
        source = '''class Manager {
          async awaitCurrentModelWithStartupCache(){return this.currentModel}async awaitCurrentModel(){return this.currentModel}
          async setModelFromStoredId(e,t){return!!e?.trim()&&(await this.setCurrentModelWithParameters(e.trim(),[],t),!0)}
          getParametersForModel(){return [{id:'reasoning',value:'high'}]}
          async setCurrentModelWithParameters(id,parameters){this.selected={id,parameters}}
        }'''
        patched = patch_cli_source(source)
        check = '''
        const assert=require('node:assert/strict');(async()=>{
          const manager=new Manager;manager.currentModel='opus';let ready=false;
          manager.modelFetchPromise=new Promise(resolve=>setTimeout(()=>{ready=true;resolve()},5));
          assert.equal(await manager.awaitCurrentModelWithStartupCache(),'opus');assert.ok(ready);
          await manager.setModelFromStoredId('opus',{});
          assert.deepEqual(manager.selected,{id:'opus',parameters:[{id:'reasoning',value:'high'}]});
        })().catch(error=>{console.error(error);process.exitCode=1});'''
        subprocess.run(['node', '-e', patched + check], check=True, capture_output=True)
        with self.assertRaises(ValueError):
            patch_cli_source(source + source)
        with self.assertRaises(ValueError):
            patch_cli_source('unknown CLI')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.js').write_text('unknown CLI')
            with self.assertRaisesRegex(ValueError, '指纹不匹配'):
                patched_cli(root / 'cursor-agent-local')
            self.assertFalse((root / 'index.opus55-high.js').exists())

    def test_local_credentials_stay_in_environment_and_provider_fallback_is_removed(self):
        source = {'PATH': 'fixture', 'CURSOR_ENABLE_BEDROCK': '1', 'CURSOR_ENABLE_LOCAL_BEDROCK': '1',
                  'CURSOR_LOCAL_AGENT_API_KEY_HELPER': '/unused', 'ELECTRON_RUN_AS_NODE': '1'}
        env = cli_environment({'claudePort': 43188, 'key': 'fixture-local-secret'}, source)
        self.assertEqual(env, {'PATH': 'fixture', 'CURSOR_LOCAL_AGENT_BASE_URL': 'http://127.0.0.1:43188/cli/v1',
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
