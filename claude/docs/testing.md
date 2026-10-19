# Testing and compatibility

## Supported clients

| Version | Commit | Platform |
| --- | --- | --- |
| 3.25.9 | `5d4df965746c5d09740842fc0f1331ba1c157830` | Windows x64 |
| 3.24.12 | `37b865941ccb31e2fc90c685157534efca87f960` | Windows x64 |
| 3.22.12 | `3a92974361033b2051526321308c2740fe5912c0` | Windows x64 |
| 3.22.9 | `2ca0f45baa06796a86f6c6ba2b9bedacaf94c370` | Windows x64 |
| 3.22.5 | `a00aa8754ab5bae70b637d98e126f9dbd4e1e5d0` | Windows x64 |
| 3.21.18 | `c4730f7d93d787d9ab120af715999f0345ee5bc0` | Windows x64 |
| 3.21.16 | `8ae78e8eee1e63479c7e0504b664bc0a80c68000` | Windows x64 |
| 3.21.13 | `e44a49c17e334d442e58bbde931d791200f014a0` | Windows x64 |
| 3.21.12 | `05ddb9e824590e2c1db6bd2548dd71bf67ac9d20` | Windows x64 |
| 3.21.9 | `9998796a6096ce83d83a9332bfe7473b985db750` | Windows x64 |
| 3.21.1 | `74f717017ddcbf0554cd8c91ec7e2fb56983a070` | Windows x64 |
| 3.20.23 | `b23e0e2d3c0fc9bb9311f4390230a120ccc9aa50` | Windows x64 |
| 3.20.21 | `f09fca384ceca23f7bf21f9c23655b162641d740` | Windows x64 |
| 3.20.17 | `0c32194e3fb5ffaced9fb36430b860ec301e1fc0` | Windows x64 |
| 3.20.11 | `69d099d6568dc97e110ba8184614faf51c4040b0` | Windows x64 |
| 3.20.7 | `979197d5570b168c034c634b3e21f2bea3ea5be0` | Windows x64 |

The build JSON files record SHA-256 hashes of original JavaScript bundles. Version-specific installers also require unique patch anchors and run Node.js syntax checks before writing application files. Existing GPT installations are accepted only through a matching local installation manifest.

The public source check and unit tests do not require Cursor or Claude sign-in. They cover environment handling, model and context mapping, function-call preparation, usage parsing, picker sections and exact bridge-process matching. CI runs these on Windows with Node.js 22 and 24. Local verification used Node.js 26.7.0; CI results are separate evidence.

## Usage label in the picker

Cursor renders "36% used" beside its own section from the section component’s `titleTrailing` prop, and the subscription sections now use the same one. `usage-label.mjs` turns either bridge’s answer into a label: Claude reports a list of windows, ChatGPT a primary and a secondary window with their length in seconds, and the window closest to its limit is the one shown. Live values while this was built: ChatGPT 23% of the week, Claude 30% of the 5-hour session against 64% of the week, so Claude reads 64%.

The helpers are prepended by every link, so they are assignments rather than declarations and a second copy simply overwrites the first; a test loads two copies in a row to keep it that way. Unit tests cover both bridge shapes, the tooltip, rounding that never turns a started window into 0%, the throttle, an uninstalled companion and a bridge that fails to answer.

## Remote runtime patch

The four runtime-side repairs run wherever the agent runs, so a remote session needs them on the host. `scripts/install-remote.mjs` reads the two extension bundles from `~/.cursor-server/bin/<platform>/<commit>` over ssh, applies the same patch functions the local installer uses, checks the result with `node --check` on the client and writes it back by rename. Each file keeps its untouched copy as `main.js.cursor-links-original`, and one shared manifest records the pristine and patched hashes plus which links are installed.

Verified on a live host on September 26, 2026: all three links installed in order on the same build as the client, the shared registry in the host's bundle listing `chatgpt-codex/`, `claude-subscription/` and `inception-mercury/`, and both originals preserved. What sent us looking was a real failure on that host: a `task_v2` call with no `model` was rejected by the unpatched runtime with *Invalid model selection ""*, while the retry that named a model explicitly succeeded.


On a Windows host every command travels as an encoded PowerShell script, because the default shell there is cmd and quoting through it is a trap. Verified against a live Windows server on September 26, 2026: PowerShell 5, the same `binwin32-x64<commit>` layout, and a round trip of 200,000 characters with non-ASCII, quotes and backslashes that came back byte for byte with a matching hash.

Not yet confirmed: a remote turn against the patched host.

## Remote sessions, changed in 3.22.9

The patch used to force a remote session into Cursor's dedicated UI runtime so that the bridge on the client's loopback stayed reachable. That runtime has no notion of a remote workspace: `isRemote`, `remotePlatform`, `pathStyle` and `remoteAuthority` do not appear in its bundle at all, and it resolves paths with the client's own path module. The renderer hands it the workspace path in the host's own form (`BP(uri, true, isRemote)` turns the separators back into slashes), so a Windows client against a Linux host produced:

| Call | Result on a Windows client |
| --- | --- |
| `resolve("/srv/app")` | `C:\srv\app` |
| `resolve("/srv/app", "src/main.ts")` | `C:\srv\app\src\main.ts` |
| `join("/srv/app", "src/main.ts")` | `\srv\app\src\main.ts` |

The runtime does not only format those strings, it uses them: the workspace boundary check for every tool call, `.cursor/rules` discovery, `git rev-parse --git-common-dir` with that directory as `cwd`, the ignore-file walk up to the drive root, and the `.git` probe that builds the sandbox policy. Anything routed back through the renderer worked, anything the runtime resolved itself did not.

From 3.22.9 the agent therefore runs on the SSH host, which is Cursor's own arrangement: the agent-exec provider is registered per remote authority and implements `runLocalAgent` itself. The provider configuration is resolved in the renderer and travels with the request, so the host receives the bridge address and reaches it through the ssh reverse forward.

Verified without touching an installation, against copies of the original 3.22.9 bundles:

- the reproduction above, run against Node's win32 path implementation;
- the patched workbench no longer contains `__useChatgptDedicatedRuntime` and leaves the native dedicated-runtime decision alone, while the run gate for subscription models stays;
- the routing check now expects a remote subscription model to take the same route as an ordinary one, and passes on both surfaces;
- the `~/.ssh/config` writer has unit tests for the block format, three links sharing one block, repeated installs, removal restoring the file byte for byte, an explicit host list and a malformed block being refused;
- a dry run on a copy of a real configuration, with `ssh -G` used to confirm that OpenSSH parses the result, attaches the three forwards to a configured host and leaves an unrelated host without any.

Not yet confirmed: a live remote turn. The host's own runtime under `~/.cursor-server` is unpatched, so reasoning effort forwarding and the subagent model repairs are missing there.

## Cursor 3.25.9 update

Cursor 3.25.9 is supported through its symbol table and file hashes alone; no installer or patch module of its own was needed. The extractor matched every role (47 of 52 names changed in the editor, 42 in the Agents Window). Four anchors moved: the Agents Window has a second fragment that ends in the same names as the picker sections, so the sections are now inserted after the picker's own fragment; the transcript cache now drops itself when the raw conversation map is replaced, which makes the cache repair unnecessary on this build; the prompt session takes retry options; and the subagent model resolver was rewritten around one classifying lookup. It still rejects an empty model, so the normalisation stays. The checks bind the new helpers by role and find function ends by parsing. All automated checks pass on 3.25.9, and the reviewed 3.24.12 and 3.22.12 trees still verify.

## Cursor 3.24.12 update

Cursor 3.24.12 (3.23 was skipped) is the first build supported through its symbol table alone: `symbols-<version>.json` and `build-<version>.json`, applied by `patches-workbench.mjs` and the shared `install-build.mjs`. The workbench module reproduced the reviewed 3.22.12 installer output byte for byte before it was used here; the builds up to 3.22.12 keep their own installers. The release changed more than names: the model picker went through the React compiler, so the subscription sections now go into a memoized fragment that is rebuilt while they exist; the run gate no longer passes `localMode` in its options; both runtime bundles ship native `??`, `?.`, async functions and object spreads; the two protobuf messages the action manager uses were renamed (`QF` to `QFf`, `RG` to `RGk`) and are now found by their role; and the engine's run parameters rotated. All automated checks pass, and the patch was checked on top of cursor-gpt-link and under cursor-mercury-link in Mercury's combined scenario. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.22.12 update

Cursor 3.22.12 renamed 30 of the 50 derived symbols on each surface and changed nothing the patches anchor to. The extractor now lives in the repository as `scripts/derive-symbols.mjs`, which is how this port started: it reproduced every reviewed 3.22.9 value before it was used here. Both runtime bundles needed no change. All automated checks pass and the three patches were installed together on a local 3.22.12. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.22.9 update

Cursor 3.22.9 renamed symbols again and changed nothing else: 16 of 50 in the editor, 31 of 50 in the Agents Window. The anchors the minor release had moved a build earlier, the model map and `subscribeHeaders`, stayed as 3.22.5 left them, and both runtime bundles are unchanged. The extractor reproduced every reviewed 3.22.5 value before it was used here. All automated checks pass and the three patches were installed together on a local 3.22.9. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.22.5 update

Cursor 3.22.5 is the first minor release these patches have been carried across, and it renamed more than four fifths of the derived symbols: 42 of 50 in the editor and 41 of 50 in the Agents Window. Two things changed beyond the names. The default model map renamed both its prefix binding and its mapper, which every build since 3.20 had left alone. And `subscribeHeaders` was rewritten: the disposed-store check is now an early return instead of a ternary, and the reactive read the old anchor matched on is gone. The shared subagent lifecycle module now recognises both shapes and hydrates the transcript after the new guard, so the older supported builds keep their original treatment. Everything else, including both runtime bundles, needed no change. All automated checks pass and the three patches were installed together on a local 3.22.5. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.18 update

Cursor 3.21.18 renamed the obfuscated workbench symbols again, this time 11 of 50 in the editor and 13 of 50 in the Agents Window; the anchored code and both runtime bundles are unchanged. The extractor reproduced every reviewed 3.21.16 value unchanged before it was used on this build. The recycled name this time sits in the Plan & Usage card itself: the Agents Window identifier that rendered the card in 3.21.16 is the card's useEffect alias in 3.21.18, so a symbol-by-symbol substitution would have swapped the two. All automated checks pass and the three patches were installed together on a local 3.21.18. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.16 update

Cursor 3.21.16 renamed the obfuscated workbench symbols again, and again left the anchored code and both runtime bundles untouched. Half the workbench symbols changed on each surface. The extractor was rebuilt for this port and first had to reproduce every reviewed 3.21.13 value before it was used here. Recycled names showed up once more: the editor identifier that pointed at the Google dashboard link in 3.21.13 is the settings card's useEffect alias in 3.21.16, so replacements are made on whole anchors rather than symbol by symbol. All automated checks pass and the three patches were installed together on a local 3.21.16. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.13 update

Cursor 3.21.13 renamed the obfuscated workbench symbols again; the anchored code is unchanged and the runtime bundles needed no change. The extractor was validated against the reviewed 3.21.12 values before this build was derived. Recycled names caught the eye again: the editor identifier that meant the tool-former capability here was the untracked reader in the Agents Window a build earlier, which is why whole anchors are replaced rather than single symbols. All automated checks pass and the three patches were installed together on a local 3.21.13. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.12 update

Cursor 3.21.12 renamed the obfuscated workbench symbols again; the code the patches anchor to is unchanged. The symbols were re-derived by role and the extractor was validated against the reviewed 3.21.9 values before it was trusted with this build. Names are recycled between builds, so replacements are made on whole anchors rather than symbol by symbol: in the editor bundle the identifier that meant useState in 3.21.9 means useEffect in 3.21.12. The runtime bundle anchors needed no change. All automated checks pass, and the three patches were installed together on a local 3.21.12. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.9 update

Reviewed on September 17, 2026 against commit `9998796a6096ce83d83a9332bfe7473b985db750`. Both workbenches renamed their minified identifiers; the anchored code is structurally unchanged. The workbench symbols were derived with a script that locates each one by the role it plays (picker sections, default model mapping, local run gate, dedicated runtime host, activation, Plan & Usage card and hooks, login action registration, Task bubble types and subagent service). Run against the pristine 3.21.1 bundles, the script reproduced every symbol reviewed for that build before it was trusted with 3.21.9. The runtime bundle anchors, which read their symbols from the match since 3.21.1, needed no change.

The automated checks pass on 3.21.9 for both workbench bundles and both runtime bundles, with the same coverage as 3.21.1. Both patches were installed together on a local 3.21.9, ChatGPT first and Claude second. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.21.1 update

Reviewed on September 16, 2026 against commit `74f717017ddcbf0554cd8c91ec7e2fb56983a070`. Both workbenches renamed their minified identifiers again, and this time both agent runtime bundles also rotated their minified locals: the name sequence moved from `e,t,n,r,o,s` to `e,t,r,n,o,s`, and the two bundles no longer agree with each other. That broke every literal anchor and several regex anchors that had pinned those names, so the affected patches now read their symbols out of the anchor match instead: the reasoning branch, the local API type heuristic, the conversation action receiver and its protobuf namespace, the plan initializer, the local task configuration and the subagent model resolver.

Both runtime bundles were also re-chunked. `main.js` shrank from 10.08 MB to 8.48 MB (agent-exec) and from 8.83 MB to 5.95 MB (local-agent-runtime), with the remainder moved into numbered webpack chunks beside it. Every patched anchor still lives in `main.js`.

One behavioural change: `subscribeHeaders` now returns an empty disposable when its store is already disposed. The transcript warm-up is no longer run through a disposed store.

The automated checks pass on 3.21.1 for both workbench bundles and both runtime bundles: syntax and unique anchors, subscription settings rendering and login action registration, the native action manager, the Max toggle and context budget, the subagent lifecycle, the subagent registration barrier, the native subagent model resolver, Explore settings, reasoning forwarding and the workbench checksum. Checks that previously pinned one bundle’s minified names were widened to resolve their dependencies by role.

Both patches were installed together on a local 3.21.1, ChatGPT first and Claude second. Cursor started with no workbench errors in its logs, and both bridges answered with their model catalogs. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

## Cursor 3.20.23 update

Reviewed on September 15, 2026 against commit `b23e0e2d3c0fc9bb9311f4390230a120ccc9aa50`. Both workbenches changed their minified identifiers. The picker, subscription usage components, dedicated-runtime activation, Task parameters and subagent service bindings were checked against the new source. The two agent runtime bundles only changed their privacy schema and build metadata; existing runtime patch anchors remain valid.

The following controlled checks passed:

- All 63 ChatGPT and 65 Claude unit tests, plus source checks.
- Exact original hashes, unique anchors and JavaScript syntax for all generated bundles.
- Native SSH routing, Task registration, Explore model selection, inheritance and restrictions.
- Immediate local stop, parent cancellation, transcript refresh, queued delivery and Plan-to-Build message forwarding.
- Context and MAX switching with effort preserved; ChatGPT Fast forwarding and Claude context forwarding.
- Subscription settings rendering against the actual native hooks and card components, and ChatGPT login command registration in both workbenches.
- Standalone and combined installations, linked manifest hashes and exact restoration of every original file.
- ChatGPT native build checks against 3.20.21 to check backward compatibility.

These checks execute extracted native functions with controlled dependencies. They do not prove a complete live SSH session or every UI interaction. After installing both patches and starting Cursor 3.20.23, short live requests completed in the Agents Window with Claude Opus 5 High and GPT-6 Astra Medium (272K). Switching from Claude to ChatGPT in the same test conversation also worked. These prompts deliberately requested no tools or file changes. Fresh IDE, remote SSH, attachment and full subagent workflow checks remain pending for this build. Both installed manifests and backup hashes were verified. Native Responses-adapter error and tool-call checks also passed against both installed runtime bundles. Original build hashes are recorded in [the build metadata](../build-3.20.23.json).

## Cursor 3.20.21 update

On September 14, 2026, the patch anchors and referenced symbols were reviewed against Cursor commit `f09fca384ceca23f7bf21f9c23655b162641d740`. The model mapper, picker renderer, usage components, dedicated-runtime activation and Task bubble parameters have new identifiers. Version-specific definitions preserve support for the preceding builds.

The following checks passed against local copies of the exact new bundles:

- Unique patch anchors and JavaScript syntax in both workbenches, both agent runtimes and the main process.
- Native SSH routing with workspace execution resources and cancellation preserved.
- Reasoning and Fast forwarding for ChatGPT, and effort plus 200K/1M context forwarding for Claude.
- Native subagent registration and model inheritance, including reproductions of the missing Task bubble and empty model failures.
- Both native Responses adapters with timeout, sign-in and quota errors, plus a successful tool call. The probe now accepts native identifiers containing a dollar sign.
- Standalone Claude, standalone ChatGPT, and combined installations; linked hashes and exact restoration of the original files after uninstall.

Both patches were installed locally after those checks. Installed-file and backup hashes matched. The ChatGPT native build checks and Claude Responses-adapter checks were also repeated successfully against Cursor 3.20.17. These are controlled automated checks; a fresh manual IDE, Agents Window and SSH test remains pending for 3.20.21.

The reviewed 3.20.21 hashes are in [the build metadata](../build-3.20.21.json).

## Cursor 3.20.17 update

On September 12, 2026, the desktop and Agents Window model mapping, picker rendering, usage components and dedicated-runtime symbols were updated for this exact build. The new metadata also verifies the original `product.json`. All 28 unit tests, source checks and both native Responses adapter checks passed. The adapter checks cover timeout, sign-in and quota errors, plus a successful function call.

Standalone Claude and combined ChatGPT/Claude installations passed syntax and unique-anchor checks on a separate local copy. Both native workbench routing methods retained SSH workspace execution resources and cancellation signals. Every supported effort value was checked with both 200K and 1M forwarding. Both patches were then installed locally, and all installation, linked-manifest and backup hashes matched. These are automated checks; a new manual IDE, Agents Window and SSH test is still pending.

## Manual and live checks

On September 10, 2026, Sonnet and Fable produced function calls through the bridge and used the returned tool result. Short Sonnet requests succeeded with both 200K and 1M selected. This does not test a full one-million-token workload.

On September 11, 2026, both patches were installed on Cursor 3.20.11. Generated JavaScript passed syntax checks and installation hashes matched. The user confirmed model selection and a file edit after reload. That confirmation did not specify the provider or distinguish IDE from Agents Window coverage.

The automated Claude test on 3.20.11 reported a concurrent OAuth token-refresh error. Usage retrieval was also unavailable during that check. Those tests are not marked as passing. Claude SSH file edits, separate window coverage, approvals and cancellation still need dedicated manual tests.

## Cursor updates

1. Close Cursor and check the newly installed version against the supported table.
2. Run `npm run status`. If it reports old-version state, do not force a restore.
3. Confirm Cursor has replaced the old patched files. Preserve the old backups and move `installed.json` out of the way, for example to `installed.json.before-update`.
4. Run `npm run check`. Proceed only if the new original hashes are recognized. Modified or mixed-version installations need repair through the normal Cursor installer first.
5. Install the supported ChatGPT patch first if used, then install Claude again.

Do not edit the supported version number or hash list to bypass verification. A new build needs separate anchor review and testing.

## Live test

With the local bridge running:

```powershell
npm run test:live
```

This makes real requests and consumes usage. It requires a function call for adding two numbers, supplies the result and verifies the final reply. It does not edit workspace files. It tests the bridge, not the complete Cursor UI.

## Reconnect regression check

On September 11, 2026, the original `response.failed` behavior was reproduced against the installed Cursor 3.20.11 Responses adapters and incomplete-stream guards in both runtime bundles. The corrected bridge passed synthetic timeout, login and quota-error cases, and a successful function-call response. HTTP tests also verify cancellation and request-slot cleanup. These checks do not establish an SSH file-edit result.

To run the installed adapter checks without model requests:

```powershell
npm run check:runtime -- "C:\path\to\Cursor\resources\app"
```

This reads supported installed code and exercises it with synthetic inputs. It does not modify the application or send network requests beyond loopback.

Catalog discovery also passed a live check with a clean CLI exit. After the stream correction, the live tool-round-trip test exposed the OAuth refresh-lock error. A later official `claude auth status --json` call returned `loggedIn: false` and `authMethod: none`; a new local sign-in is required before live inference and SSH validation can finish. No live round-trip success is claimed for this repair.

## Attachment support

On September 11, 2026, the updated Sonnet adapter read the color of a generated PNG and a validation word embedded only in a PDF. Both passed through the running local subscription bridge. The standard function-call and tool-result round trip also passed with the new streaming JSON input format. Unit tests cover byte preservation, history references, multimodal tool results, UTF-8 documents, invalid data, URL handling and CLI result parsing. This supersedes the earlier text-only limitation. These bridge tests do not establish drag-and-drop coverage for every format or a new SSH UI test.

The implementation follows [Claude SDK streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) and [Claude PDF content blocks](https://platform.claude.com/docs/en/build-with-claude/pdf-support).

## Context token accounting

The context correction passed 28 unit tests and the installed Cursor 3.20.11 runtime checks. A synthetic three-step turn with 200,000 cumulative input tokens reports the final 69,000-token prompt instead of the cumulative total. Coverage includes repeated message IDs, subagents, cached tokens, separate result boundaries and output-count fallbacks.

In a live Claude Opus check on September 11, 2026, two visually identical 512 by 512 PNGs of 1,497 and 787,127 bytes both used 1,794 input tokens and 79 output tokens. Both were understood correctly. This checks that image encoding size does not turn into text-token occupancy. The affected existing conversation still needs a new response to refresh its saved UI value.

See [Claude SDK usage scopes](https://code.claude.com/docs/en/agent-sdk/cost-tracking) for the distinction between per-step input usage and cumulative turn usage.


## Local Claude subagent startup

On September 13, 2026, the missing parent Task bubble reported for ChatGPT was also reproduced with a Claude model ID in Cursor 3.20.17's native desktop and Agents Window registration methods. This was a controlled reproduction, not a recorded Claude SSH session failure.

The Claude patch now creates a missing Task bubble through Cursor's existing ToolFormer method when both the request and the loaded parent use Claude subscription models. Existing bubbles, cancellation and the normal registration barrier are preserved. Missing parents or capabilities still fail through the original path.

All 36 Claude unit tests passed. Native registration checks passed for standalone Claude and combined ChatGPT/Claude candidates in both workbenches. Combined installation and uninstall checks verified linked manifests, backups and byte-for-byte restoration of the original build. A completed live subagent task in the SSH Agents Window still needs manual confirmation.

Run the check:subagents npm script with the patched Cursor resources/app path to repeat the native registration check without model requests.


### Empty optional model on the first attempt

The later ChatGPT SSH session contained a separate failure after reload: Task calls supplied an empty model string and failed native validation. The next attempts selected a model successfully and started local subagents. This confirms successful startup after retries, not reliable first-attempt behavior before the additional repair.

For this subscription provider, an empty or whitespace-only requested model is now normalized to an omitted selection before the native resolver runs. Cursor still chooses the inherited, configured or forced model and checks availability. Explicit models and other providers retain native validation. Both runtime resolvers passed a reproduced empty-string failure, inheritance, configured defaults, forced-model handling and blocked-model checks. A new live test of the first attempt after this additional repair is still pending.

### Bridge startup after the launching process exits

A detached launcher now owns the complete stop/start sequence. Windows regression tests cover cold startup and replacement of an existing fixture worker after the launching process exits immediately. Previously the restart callback belonged to the exiting host. These checks use temporary workers, not account credentials or model requests. Both local usage endpoints were checked separately; the Agents Window display still requires a manual check.

### Explore model settings on Cursor 3.20.21

The workbench now includes the explicitly selected Explore model in the local runtime catalog. Previously a selection missing from `localProviderAgentModelIds` silently became Inherit. The patch also carries the selected model parameters into the client subagent request and preserves parent parameters for inherited models. Default, Inherit and Disabled continue through Cursor's native resolver, including its priority for explicit Task model arguments. Disabled applies to Explore, not every type of subagent.

Tests reproduce the missing-catalog fallback using Cursor's local task factory and verify both runtimes. Standalone Claude and combined installations, IDE and Agents Window routing, parameter forwarding and exact restoration were checked on a separate copy of 3.20.21. After reloading Cursor, the project owner confirmed a different selected Explore model, its effort setting, and both tooltip layouts. The test response did not separately identify the provider, window or SSH host, so it is not recorded as a complete matrix of those environments. Tooltip tests cover every effort and context variant using the native Markdown layout.

### Context and MAX mode on Cursor 3.20.21

The native mode solver was exercised in both workbenches for every synthetic effort/Fast combination, in both directions. Ordinary models retain Cursor's original behavior. Both native runtime metadata decoders reproduce the ignored top-level `context_window` field and correctly read `capabilities.context_length`. The native prompt-session budget respects the selected size, falls back to the advertised size and caps oversized selections at the provider limit. Standalone Claude and combined installs, linked hashes and exact restoration passed. Unit tests also verify the real catalog variants, Claude CLI context selection, and that local MAX/Context controls are not sent as unsupported OpenAI API fields. No full-window stress test has been performed.

After installation, both live model endpoints were checked using Cursor's native metadata decoder and context-budget functions. The tested GPT-5.6 Luna entry reported 272,000 tokens and the Claude Opus entry reported 1,000,000. A short live response completed successfully through each bridge; the Claude request explicitly selected 1M. These requests establish basic inference compatibility, not behavior at a full context window. After reloading Cursor, the project owner confirmed changing the context size while retaining effort and receiving the next response. The reply did not separately establish a legacy-plan MAX toggle test or full-window stress coverage.

### Subagent transcript and cancellation on Cursor 3.20.21

The project owner reported empty subagent panels after switching chats and child runs continuing after Stop. Source inspection found that cancelChat only cascaded for a chat with subagentInfo and skipped an already idle parent. stopSubagentTree also waited for storage loading and an agent-host RPC before aborting local runs. Subscription chats now cancel their loaded tree immediately, including an idle parent with active children. Local inference is cancelled through the existing runtime signal rather than an unrelated agent-host session.

Subagent requests combine their own signal with the active parent generation signal. Tests cover a stop before inference, cancellation during a background child run, cancellation during creation, a usable later turn, provider scoping and listener cleanup. Late creation results are cancelled before they can run. The original desktop and Agents Window methods fail the parent-stop regression; the patched methods pass.

The transcript classifier cached conversationMap by composer identity alone. A replaced map on the same composer could therefore remain invisible. The patch refreshes that cache for subscription subagents and hydrates up to 64 recent missing or placeholder bodies when a transcript is attached. It uses Cursor's existing loader, preserves live messages and skips hydration after disposal. A native-method regression reproduces map replacement without replacing the composer.

The ChatGPT suite has 52 passing tests, including a real loopback HTTP stream that closes upstream when its client disconnects. The Claude suite has 54 passing tests, including its existing request-disconnect coverage. Native checks passed on both workbenches, standalone Claude and the combined installation. Existing SSH routing, model settings, context controls, linked manifest hashes and exact restoration were also checked. No new live model request was needed for these tests. The installed UI still requires a manual chat-switch and Stop check after reload; these results do not establish remote process cancellation timing.

### Queued follow-ups and Plan-to-Build on Cursor 3.20.21

The local workbench runner did not pass its conversation action manager to the runtime. Its engine used an empty action receiver. The Build override also omitted unconfirmed human messages collected from the transcript. Both gaps are patched in the IDE and Agents Window bundles and both local runtimes. The connection uses the existing per-run binary callback transport, including the dedicated runtime used for SSH.

Eleven regression tests cover FIFO delivery, attachment references, replay deduplication, failures during preparation, end-of-turn races, checkpoint continuation, cancellation, provider isolation and prepended Build messages. Native manager checks exercise queue submission, replay, acknowledgement and Stop using methods extracted from the original Cursor build. Both runtime receiver anchors and the plan initializer are checked, along with standalone and combined installation and exact restoration. These tests use synthetic messages and do not make model requests. Manual Plan-to-Build validation, especially during SSH subagent execution, is still pending.

## Claude context display correction

The picker now reports 200K as the standard window and 1M separately as the extended window. Previously both selections displayed a 1M denominator in the Agents Window. The provider catalog still advertises the full supported capacity so 1M requests are not capped at 200K. A regression test executes the native context display functions, reproduces the old result and checks 200K/1M/200K switching with a stored 1M checkpoint. At 162,600 tokens the corrected standard display reports about 81 percent instead of 16 percent. Run `node scripts/check-context-display.mjs <Cursor resources/app>` against a reviewed build.
