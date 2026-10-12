import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPickerSections, insertCompiledSections, compiledRebuild, compiledSectionsParts} from '../src/picker-sections.mjs';
import {compareVersions, atLeast} from '../src/versions.mjs';

const replaceOnce = (source, from, to) => {
  if (source.split(from).length !== 2) throw new Error('not unique: ' + from);
  return source.replace(from, to);
};

// The shape of the 3.24.12 picker after the React compiler, cut down to the
// parts the patch touches.
const groupReturn = 'return o.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...F,...D],others:$}:{leading:F,promoted:D,others:$}';
const sectionsReturn = 'return t[39]!==se||t[40]!==re||t[41]!==ue||t[42]!==J?(ce=V4t(TPs,{children:[J,se,re,ue]})';
const compiled = `function g(){${groupReturn}}function picker(){let se;se=gN(j_t,{models:D.promoted,title:ne,titleTrailing:ee,renderModel:y},"promoted-models");let ce;${sectionsReturn},t[43]=ce):ce=t[43],ce}`;
const symbols = {groupReturn, modelsVar:'D', jsx:'gN', fmt:'j_t', renderModel:'y', sectionsReturn,
  promotedRender:'se=gN(j_t,{models:D.promoted,title:ne,titleTrailing:ee,renderModel:y},"promoted-models")', promotedVar:'se'};

test('the compiled fragment is read apart into its slots', () => {
  assert.deepEqual(compiledSectionsParts(sectionsReturn), {condition:'t[39]!==se||t[40]!==re||t[41]!==ue||t[42]!==J',
    result:'ce', fragment:'V4t', component:'TPs', leading:'J', promoted:'se', pinned:'re', others:'ue'});
  assert.throws(() => compiledSectionsParts('return x?(y=z)'), /Unrecognised picker sections fragment/);
});

test('the subscription sections go in front of the promoted one', () => {
  const patched = patchPickerSections(compiled, replaceOnce, symbols);
  const list = patched.match(/children:\[(.*?)\]\}\)/)[1];
  assert.ok(list.startsWith('J,D.chatgpt.length>0&&gN(j_t,{models:D.chatgpt,title:"ChatGPT Subscription"'), list);
  assert.ok(list.includes('"claude-subscription-models"),se,re,ue'), 'promoted, pinned and other sections keep their order');
  assert.ok(patched.includes('return __withSubscriptionPickerSections(o.mergeLeadingIntoPromotedSection'), 'grouping is wrapped');
});

test('the fragment is rebuilt on every render while subscription sections exist', () => {
  const patched = patchPickerSections(compiled, replaceOnce, symbols);
  assert.ok(patched.includes(`return ${compiledRebuild('D')}t[39]!==se`));
  // Evaluate the rebuilt condition: with sections it must be true even when
  // every memo slot is unchanged.
  const from = patched.indexOf('return ' + compiledRebuild('D')) + 'return '.length;
  const condition = patched.slice(from, patched.indexOf('?(ce=', from));
  const check = new Function('D', 't', 'se', 're', 'ue', 'J', `return ${condition}`);
  const slots = ['', ...Array(38).fill(0), 'se', 're', 'ue', 'J'];
  assert.equal(Boolean(check({chatgpt:[1], claude:[]}, slots, 'se', 're', 'ue', 'J')), true);
  assert.equal(Boolean(check({chatgpt:[], claude:[], mercury:[]}, slots, 'se', 're', 'ue', 'J')), false, 'no sections, the memo stays in charge');
  assert.equal(Boolean(check({}, slots, 'se', 're', 'ue', 'J')), false, 'a grouping without our arrays is left alone');
});

test('a second link finds its place after the first and the condition is added once', () => {
  const first = patchPickerSections(compiled, replaceOnce, symbols);
  const second = insertCompiledSections(first, replaceOnce, symbols, 'D.mercury.length>0&&gN(j_t,{models:D.mercury},"inception-mercury-models")');
  assert.equal(second.split(compiledRebuild('D')).length - 1, 1, 'one rebuild condition');
  assert.ok(second.includes('"claude-subscription-models"),D.mercury.length>0&&gN(j_t,{models:D.mercury},"inception-mercury-models"),se,re,ue]'));
});

test('patching twice changes nothing', () => {
  const once = patchPickerSections(compiled, replaceOnce, symbols);
  assert.equal(patchPickerSections(once, replaceOnce, symbols), once);
});

test('the inline picker of the older builds is still patched as before', () => {
  const promotedAnchor = 'oL(tgt,{models:B.promoted,title:c?.promotedSectionTitle';
  const older = `function g(){${groupReturn}}function picker(){return x([${promotedAnchor},renderModel:x},"promoted-models")])}`;
  const patched = patchPickerSections(older, replaceOnce, {groupReturn, promotedAnchor, modelsVar:'B', jsx:'oL', fmt:'tgt', renderModel:'x'});
  assert.ok(patched.includes('"claude-subscription-models"),' + promotedAnchor));
  assert.ok(!patched.includes(compiledRebuild('B')), 'no memo condition outside the compiled picker');
});

test('versions compare as numbers, not as text', () => {
  assert.equal(compareVersions('3.24.12', '3.22.12'), 1);
  assert.equal(compareVersions('3.22.9', '3.22.12'), -1, '9 is less than 12');
  assert.equal(compareVersions('3.22.12', '3.22.12'), 0);
  assert.equal(atLeast('3.24.12', '3.22.9'), true);
  assert.equal(atLeast('3.22.5', '3.22.9'), false);
});
