> Historical report from Artic0din/cursor-claude-link at b4f0b7c. These are the source fork author's results, not validation of this combined fork or this machine.

# Testing and compatibility

## Verified macOS build

This fork targets Cursor 3.22.12 only.
The six original-file hashes were captured from the signed macOS Apple Silicon application with `scripts/capture-hashes.mjs`.
The exact Cursor commit is `3a92974361033b2051526321308c2740fe5912c0`.
The minimum supported OS is macOS 26.
A matching version label alone is insufficient to establish compatibility.

## Current checks

On October 1, 2026, the patch installed into a copy of the signature-verified original 3.22.12 app, and `check:runtime`, `check:subagents`, `check:actions` and `check:ui` passed against that copy, as did all unit tests.
GPT then Claude were installed into `/Applications/Cursor.app` on 3.22.12 and signed with an Apple Development identity; both bridges started on launch and answered authenticated requests.
Restore refused to remove GPT before Claude, then Claude and GPT restored all six original hashes with a valid signature; both were reinstalled afterwards.
In the native IDE, Claude Fastest wrote `claude-smoke.txt` with exactly `CLAUDE_32212_OK\n`, read it back and replied with that content.
SSH, Agents Window agent runs and live subagent checks remain pending; the 3.21.13 results below are historical.

All 117 local tests passed on macOS with Node.js 26.8.2, with no skipped tests.
They cover bridge error handling, external tool naming, attachments, token accounting, subagent registration, Explore settings, conversation actions, Remote Control subscription rejection, exact POSIX process matching and startup after the launching host exits.
Both workbench and runtime patch candidates passed syntax checks and native behavior checks for error/tool-call responses, subagents, queued actions, settings rendering and context display using synthetic inputs.
Combined-provider regressions parse the generated helpers as ES modules and check MAX selection, Explore model selection and selected parameters for both providers.
The native runtime budget check also verifies that selected context is capped by the provider's advertised window.
Agent Host routing regressions reproduce the injected host strategy incorrectly receiving subscription turns.
Native testing then exposed a missing workspace execution provider while Agent Host was enabled.
Activation regressions verify that the existing shared host runtime registers the native provider while preserving host context, options, state getters and cleanup ownership.
Independent Agent Host modes never initialize a second legacy runtime; this avoids duplicate commands and competing rules, subagent, plugin and background-shell provider ownership.
The existing local-loop canvas registration stays unchanged, and combined installation applies the shared registration patch once.
They cover the new-turn, resume and summarize entrypoints, requested-model precedence, the native fallback, unchanged argument and cancellation identities, and host disposal.
The native-bundle check evaluates the actual constructor strategy expression and local delegate on both workbench surfaces, with shared-runtime subscription turns allowed and ordinary models retained on the host strategy.
Temporary compatibility limitation: subscription turns reject before native dispatch when an injected Agent Host strategy has either `cursor_agent_host_move_exec` or `agent_host_local_loop` enabled.
These modes are unsupported by this patch; the checks establish the compatibility error, not inference or tool support in those modes.
The native fallback, including a null injected strategy, remains available without evaluating those host-only gates.
The routing verifier executes the actual renderer feature-gate method, reproduces its missing-options TypeError and verifies that both checks supply the required options argument.
These synthetic checks read native bundles and write disposable candidates; live installation and model inference were verified separately below.
Repeating a combined installation is rejected before its active restoration manifest can be archived; the regression also permits a GPT-only installation.

## Current live installation validation

The combined GPT-first, Claude-second installation passed signing, Electron native loading and exact installation-manifest checks on Cursor 3.21.13.
Both bridge workers started automatically with Cursor using Node.js 26.8.2.
Claude Code reported version 2.1.276.

In the native IDE, **Claude Subscription — Sonnet 5, Medium, 1M** completed an authenticated file-write and readback request in a temporary local workspace.
The resulting `claude-bridge-smoke.txt` contained exactly `CLAUDE_32113_OK\n`, including the final newline, verified independently from disk.
Cursor displayed the native `Read` result for lines 1–2 and the final response `CLAUDE_32113_OK`.
The bridge completed three inference steps in this tool round trip.
This verifies real Cursor tool execution with subscription inference; selecting 1M does not establish a large-context workload test.

This live result used Agent Host's shared workspace runtime with both `cursor_agent_host_move_exec` and `agent_host_local_loop` disabled.
Independent Agent Host modes remain temporarily unsupported and produce the compatibility error described above.
Live Agents Window, SSH, subagents, cancellation and authentication renewal remain unverified.

## Earlier live installation validation

The following live results were recorded on Cursor 3.20.17 and do not establish 3.21.13 runtime coverage.
The repeated-install check passed against that combined app, leaving both manifests and all six app resources unchanged.

Both links installed directly in `/Applications/Cursor.app`, GPT first and Claude second, with an existing Apple signing identity.
Strict signature verification, Electron native loading and both installation manifests passed after combined installation.
Both bridge workers started automatically with Cursor and appeared in the native model picker.
Cloud agents and Remote Machine remain unsupported.

A native Claude file-edit request reproduced a collision between Cursor tool names and disabled Claude Code built-ins.
After assigning distinct transport names, replaying that captured request returned the expected Cursor `Write` call.
The live subscription check passed a function-call/result round trip and automatic selection of an external `Write` tool.
That earlier check requested a write without executing it; the 3.20.17 native edit and readback could not be completed because desktop automation could not unlock the Mac.
The current 3.21.13 native edit and readback result is recorded above.

Signing fixtures verify preservation of hardened runtime and entitlements after patching and resource restoration.
The fixture uses a disposable executable and an injected test signer; production requires an available Apple identity and refuses ad-hoc signing.
The checks also reject a correctly signed Intel-only executable and verify permission preservation during preflight and signed restoration.
New manifests save the original app mode; standalone removal restores it, while removing Claude over GPT keeps the app private.
Legacy manifests without an original mode retain current permissions; official reinstallation recovers the vendor defaults.
No full-app backup is required; six resource backups and recovery manifests are retained.

Combined removal was tested on the real app: GPT refused removal before Claude, Claude restoration preserved GPT, and final GPT restoration recovered all six original resource hashes.
Both restoration steps passed strict signature verification and native loading.

## Repeatable checks

```bash
npm test
npm run check:source
npm run status
npm run check:runtime -- "/Applications/Cursor.app/Contents/Resources/app"
npm run check:subagents -- "/Applications/Cursor.app/Contents/Resources/app"
npm run check:actions -- "/Applications/Cursor.app/Contents/Resources/app"
npm run check:ui -- "/Applications/Cursor.app/Contents/Resources/app"
```

Unit and source checks do not require account sign-in or model requests.
Runtime checks inspect the supported installed bundles and exercise synthetic responses and registration paths.
CI runs unit tests on macOS 26 with Node.js 22, 24 and 26; those runners do not contain a real Cursor installation.

With the bridge running, `npm run test:live` checks a function call, returned tool result and automatic external tool selection.
`npm run test:attachments` checks image and PDF content.
These optional commands consume subscription usage and do not prove complete Cursor UI coverage.

## Cursor updates and recovery

1. Close Cursor and restore Claude before restoring GPT.
2. Restore validates every resource backup before writing and re-signs the app before reporting success.
3. Retry an interrupted restore while its manifest remains present; unknown file changes stop restoration.
4. Reinstall official Cursor to recover its vendor signature or a failed signing operation.
5. Install GPT followed by Claude on the recognized build; stale manifests are archived only after original files or a valid companion installation are verified.

Never restore old resources over a newer build or edit hashes to bypass compatibility checks.
A new Mac build needs original-file capture with `scripts/capture-hashes.mjs`, anchor review and separate validation.
The six resource backups do not contain the original vendor code signature.

## Historical upstream results and remaining coverage

Earlier September 10–14 notes were inherited from the Windows implementation.
They described bridge tool calls, image/PDF input, token accounting and synthetic desktop, Agents Window and SSH routing.
They do not establish macOS installer, GUI, authentication renewal or SSH coverage.
The preceding test history remains in Git.

Live Agents Window, fresh macOS SSH file edits, live subagents, cancellation, fresh sign-in/renewal and large-context workloads remain unverified.
Fast and Ultracode are not implemented.

### Explore model settings

The workbench now includes the explicitly selected Explore model in the local runtime catalog when that ID starts with `claude-subscription/`. Foreign Explore IDs stay out of this provider's catalog so the runtime does not send them through the Claude bridge. Previously a same-prefix selection missing from `localProviderAgentModelIds` silently became Inherit. The patch also carries the selected model parameters into the client subagent request and preserves parent parameters for inherited models. Default, Inherit and Disabled continue through Cursor's native resolver.

Unit tests reproduce the missing-catalog fallback.
The 3.22.12 native task factory receives `availableModels` entries with `modelId` and resolves them internally through catalog entries with `id`; the native check exercises both sides of that contract.
Tooltip tests cover every effort and context variant using the native Markdown layout.
A live SSH Explore run with a different selected model still needs manual confirmation.

### Context and MAX mode

Context selection and Cursor's legacy MAX switch now choose the actual runtime window while preserving effort. Models advertise `capabilities.context_length` so Cursor can cap its prompt session, usage display and compaction budget. See [Context and MAX mode](model-modes.md). Unit tests cover variant scoring; native solver checks need an installed Cursor app.
