import test from 'node:test';
import assert from 'node:assert/strict';
import {modelOptions} from './model-options.mjs';

const row = (value, displayName, description, resolvedModel = value) => ({value, displayName, description, resolvedModel, supportedEffortLevels:['medium']});

test('model names come from the description prefix on older CLIs', () => {
  const options = modelOptions([row('claude-opus-4-8', 'claude-opus-4-8', 'Opus 4.8 · Best for everyday, complex tasks')]);
  assert.deepEqual(options.map(o => o.displayName), ['Claude Opus 4.8']);
});

test('model names come from displayName when the description is plain (CLI 2.1.291)', () => {
  const options = modelOptions([
    row('default', 'Default (recommended)', 'Opus 5.5 · Best for everyday, complex tasks', 'claude-opus-5-5'),
    row('opus', 'Opus 5.5', 'For complex work and everyday tasks', 'claude-opus-5-5'),
    row('claude-opus-4-8', 'Opus 4.8', 'Best for everyday, complex tasks'),
    row('claude-sonnet-4-6', 'Sonnet 4.6', 'Efficient for routine tasks')]);
  assert.deepEqual(options.map(o => o.displayName), ['Claude Opus 5.5', 'Claude Opus 4.8', 'Claude Sonnet 4.6']);
});
