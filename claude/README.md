# cursor-claude-link

This fork combines the latest vertexitde upstream with Artic0din's macOS, local tool handoff, Agent Host routing, recovery, and usage-label fixes. Windows support remains intact. The imported macOS installer targets Cursor 3.22.12 on macOS 26+ Apple Silicon. **[整合记录与验证范围](INTEGRATION.md)** lists source commits, conflict resolutions, and the separate early prototype branch. The upstream README follows.

An experimental patch that adds your Claude Code models to Cursor and uses your existing Claude subscription sign-in. Cursor keeps its agent harness, tools and approval controls. No extension is installed.

Companion project: [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link).

## Status

| Item | Current status |
| --- | --- |
| Client platform | Windows x64 |
| Latest tested Cursor | 3.25.9, October 16, 2026; automated checks |
| Cursor commit | `5d4df965746c5d09740842fc0f1331ba1c157830` |
| Previously supported Cursor | 3.24.12, commit `37b865941ccb31e2fc90c685157534efca87f960`; 3.22.12, commit `3a92974361033b2051526321308c2740fe5912c0`; 3.22.9, commit `2ca0f45baa06796a86f6c6ba2b9bedacaf94c370`; 3.22.5, commit `a00aa8754ab5bae70b637d98e126f9dbd4e1e5d0`; 3.21.18, commit `c4730f7d93d787d9ab120af715999f0345ee5bc0`; 3.21.16, commit `8ae78e8eee1e63479c7e0504b664bc0a80c68000`; 3.21.13, commit `e44a49c17e334d442e58bbde931d791200f014a0`; 3.21.12, commit `05ddb9e824590e2c1db6bd2548dd71bf67ac9d20`; 3.21.9, commit `9998796a6096ce83d83a9332bfe7473b985db750`; 3.21.1, commit `74f717017ddcbf0554cd8c91ec7e2fb56983a070`; 3.20.23, commit `b23e0e2d3c0fc9bb9311f4390230a120ccc9aa50` |
| Supported Cursor 3.20.11 | Commit `69d099d6568dc97e110ba8184614faf51c4040b0` |
| Previous supported Cursor | 3.20.7, commit `979197d5570b168c034c634b3e21f2bea3ea5be0` |
| Node.js used locally | 26.7.0 |
| Claude Code used locally | 2.1.263, signed in with Claude Max |
| Model selection and file edits | Confirmed manually after updating Cursor to 3.20.11 |
| Bridge tool calls | Sonnet and Fable round trips verified before the Cursor update |
| Context and effort | Forwarding checked in both runtime bundles; short requests tested with 200K and 1M |
| IDE and Agents Window | Both bundles patched and syntax checked; separate manual coverage is not recorded |
| Remote SSH | From 3.22.9 the agent runs on the host and reaches the bridge through an ssh reverse forward the installer writes; automated checks pass, live remote use is unconfirmed |
| Subscription usage | Settings card implemented; retrieval can be unavailable |
| Fast and Ultracode | Not implemented |

Remote SSH sessions changed with 3.22.9. Until then a remote session kept the agent in Cursor's dedicated UI runtime so that the bridge, which listens on the client's loopback, stayed reachable. That runtime resolves paths with the client's own path module: on a Windows client against a Linux host, the workspace path `/srv/app` became `C:\\srv\\app`, and the runtime then looked there for `.cursor/rules`, ran `git rev-parse` in it, walked its ignore files up to the drive root and built the sandbox policy from it. From 3.22.9 the agent runs on the SSH host, where the workspace actually is, and the bridge is published on that host's loopback with an ssh reverse forward that `cursor-claude-link` writes into `~/.ssh/config`. See [Remote sessions](#remote-sessions).

Cursor 3.25.9 is supported through its symbol table and file hashes alone; no installer or patch module of its own was needed. The extractor matched every role (47 of 52 names changed in the editor, 42 in the Agents Window). Four anchors moved: the Agents Window has a second fragment that ends in the same names as the picker sections, so the sections are now inserted after the picker's own fragment; the transcript cache now drops itself when the raw conversation map is replaced, which makes the cache repair unnecessary on this build; the prompt session takes retry options; and the subagent model resolver was rewritten around one classifying lookup. It still rejects an empty model, so the normalisation stays. The checks bind the new helpers by role and find function ends by parsing. All automated checks pass on 3.25.9, and the reviewed 3.24.12 and 3.22.12 trees still verify.

Cursor 3.24.12 (3.23 was skipped) is the first build supported through its symbol table alone: `symbols-<version>.json` and `build-<version>.json`, applied by `patches-workbench.mjs` and the shared `install-build.mjs`. The workbench module reproduced the reviewed 3.22.12 installer output byte for byte before it was used here; the builds up to 3.22.12 keep their own installers. The release changed more than names: the model picker went through the React compiler, so the subscription sections now go into a memoized fragment that is rebuilt while they exist; the run gate no longer passes `localMode` in its options; both runtime bundles ship native `??`, `?.`, async functions and object spreads; the two protobuf messages the action manager uses were renamed (`QF` to `QFf`, `RG` to `RGk`) and are now found by their role; and the engine's run parameters rotated. All automated checks pass, and the patch was checked on top of cursor-gpt-link and under cursor-mercury-link in Mercury's combined scenario. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.22.12 renamed 30 of the 50 derived symbols on each surface and changed nothing the patches anchor to. The extractor now lives in the repository as `scripts/derive-symbols.mjs`, which is how this port started: it reproduced every reviewed 3.22.9 value before it was used here. Both runtime bundles needed no change. All automated checks pass and the three patches were installed together on a local 3.22.12. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.22.9 renamed symbols again and changed nothing else: 16 of 50 in the editor, 31 of 50 in the Agents Window. The anchors the minor release had moved a build earlier, the model map and `subscribeHeaders`, stayed as 3.22.5 left them, and both runtime bundles are unchanged. The extractor reproduced every reviewed 3.22.5 value before it was used here. All automated checks pass and the three patches were installed together on a local 3.22.9. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.22.5 is the first minor release these patches have been carried across, and it renamed more than four fifths of the derived symbols: 42 of 50 in the editor and 41 of 50 in the Agents Window. Two things changed beyond the names. The default model map renamed both its prefix binding and its mapper, which every build since 3.20 had left alone. And `subscribeHeaders` was rewritten: the disposed-store check is now an early return instead of a ternary, and the reactive read the old anchor matched on is gone. The shared subagent lifecycle module now recognises both shapes and hydrates the transcript after the new guard, so the older supported builds keep their original treatment. Everything else, including both runtime bundles, needed no change. All automated checks pass and the three patches were installed together on a local 3.22.5. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.18 renamed the obfuscated workbench symbols again, this time 11 of 50 in the editor and 13 of 50 in the Agents Window; the anchored code and both runtime bundles are unchanged. The extractor reproduced every reviewed 3.21.16 value unchanged before it was used on this build. The recycled name this time sits in the Plan & Usage card itself: the Agents Window identifier that rendered the card in 3.21.16 is the card's useEffect alias in 3.21.18, so a symbol-by-symbol substitution would have swapped the two. All automated checks pass and the three patches were installed together on a local 3.21.18. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.16 renamed the obfuscated workbench symbols again, and again left the anchored code and both runtime bundles untouched. Half the workbench symbols changed on each surface. The extractor was rebuilt for this port and first had to reproduce every reviewed 3.21.13 value before it was used here. Recycled names showed up once more: the editor identifier that pointed at the Google dashboard link in 3.21.13 is the settings card's useEffect alias in 3.21.16, so replacements are made on whole anchors rather than symbol by symbol. All automated checks pass and the three patches were installed together on a local 3.21.16. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.13 renamed the obfuscated workbench symbols again; the anchored code is unchanged and the runtime bundles needed no change. The extractor was validated against the reviewed 3.21.12 values before this build was derived. Recycled names caught the eye again: the editor identifier that meant the tool-former capability here was the untracked reader in the Agents Window a build earlier, which is why whole anchors are replaced rather than single symbols. All automated checks pass and the three patches were installed together on a local 3.21.13. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.12 renamed the obfuscated workbench symbols again; the code the patches anchor to is unchanged. The symbols were re-derived by role and the extractor was validated against the reviewed 3.21.9 values before it was trusted with this build. Names are recycled between builds, so replacements are made on whole anchors rather than symbol by symbol: in the editor bundle the identifier that meant useState in 3.21.9 means useEffect in 3.21.12. The runtime bundle anchors needed no change. All automated checks pass, and the three patches were installed together on a local 3.21.12. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.9 renamed the obfuscated workbench symbols again but left the code structure unchanged. Every workbench symbol was re-derived and checked against the known 3.21.1 values first; the runtime anchors that now read their symbols out of the match needed no change. The automated checks pass on 3.21.9 for both workbench bundles and both runtime bundles, and both patches were installed together on a local 3.21.9. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.21.1 renamed the obfuscated workbench symbols and rotated the minified locals in both extension runtime bundles, so the anchors were re-derived for this build and the version-independent ones were widened to read their symbols out of the match. The automated checks pass on 3.21.1 for both workbench bundles and both runtime bundles, including the native model resolver, Explore settings, context budget, reasoning forwarding, subagent lifecycle, subagent registration, action manager and subscription settings checks. Both patches were installed together on a local 3.21.1, Cursor started with no workbench errors and both bridges served their model catalogs. Live model selection, tool calls, file edits, remote SSH and attachment workflows have not been confirmed on this build.

Cursor 3.20.23 passed syntax, anchor, SSH routing, context and effort forwarding, subagent lifecycle, queue and plan transition checks. Standalone Claude and combined ChatGPT/Claude installations were verified on a separate local copy. Support for 3.20.21, 3.20.17, 3.20.11 and 3.20.7 is retained. After installing both patches and starting Cursor 3.20.23, short live requests completed in the Agents Window with Claude Opus 5 High and GPT-6 Astra Medium (272K). Switching from Claude to ChatGPT in the same test conversation also worked. These prompts deliberately requested no tools or file changes. Fresh IDE, remote SSH, attachment and full subagent workflow checks remain pending for this build. Earlier live checks are documented separately. See [testing notes](docs/testing.md) for the exact coverage.

Only the listed builds are supported. The installer checks version, commit, original JavaScript hashes and patch anchors. A matching local ChatGPT installation manifest can identify already patched files. Unknown changes stop installation.

On Cursor 3.20.17, 3.20.21 and 3.20.23, local subscription subagents also receive a missing parent Task entry before Cursor waits for its registration. The repair passed automated checks in both workbenches; a completed SSH subagent task still needs manual confirmation. See the testing notes for details.

On Cursor 3.20.21 and 3.20.23, **Explore Subagent Model** selections are forwarded to the local runtime with their model parameters. **Default**, **Inherit** and **Disabled** retain Cursor's native behavior. Model tooltips show the context window and selected effort in the same layout as Cursor's built-in models. Context selection and the legacy MAX switch now control the actual runtime window while preserving effort. See [Context and MAX mode](docs/model-modes.md). See the [testing notes](docs/testing.md) for coverage.

On Cursor 3.20.21 and 3.20.23, stopping a subscription chat also cancels its active subagents. Local subagent stops do not wait for the agent-host service, and a cancelled parent cannot start a late child request. Reopening a subagent refreshes its transcript cache and loads the most recent missing messages. These changes passed automated checks; manual chat-switch and stop verification is still pending.

On Cursor 3.20.21 and 3.20.23, queued follow-ups are forwarded to the local runtime. Starting Build also preserves human messages that have not reached the conversation checkpoint yet. Delivery is confirmed by native message events, and stopping the chat prevents queued work from starting another run. Automated queue and build checks passed; manual Plan-to-Build validation is pending.


## What it adds

Models appear with a small Claude logo in a **Claude Subscription** section. ChatGPT subscription models and native Cursor models keep their own sections.

Each subscription section carries the same usage label Cursor puts on its own, through the section component’s `titleTrailing` prop. The label shows the window that is closest to its limit, so it is the short rolling one most of the time and becomes the weekly one exactly when the week is the tighter constraint; hovering names every window. The bridge is asked at most once a minute while the picker renders, and a bridge that cannot answer leaves the section as it was.

The model list comes from the installed Claude Code client. In the tested account it included Opus 5, Fable 5.1, Sonnet 5 and Haiku 4.5. The patch does not grant model access. Different Claude Code installations or accounts can return different catalogs.

Each model appears once. The redundant Default entry is folded into the model it resolves to. **Context** offers 200K and 1M where supported, independently of **Effort**. Standard mode holds Claude Code to 200K; extended mode enables the larger window. Haiku keeps its standard window. This is why the menu does not copy Cursor's native 300K label.

Effort levels come from model metadata: Low, Medium, High, Very high and Max where available. English descriptions explain what each model is suited to. Text added by this patch is English; existing Cursor controls retain Cursor's localization.

**Plan & Usage** contains a **Claude Subscription** card with the reported plan, usage percentages and reset times. It refreshes every minute while open. The bridge uses Claude Code's `/usage` command, with no model prompt, to retrieve these values. Errors appear as unavailable status rather than invented percentages.

## Requirements

- Windows x64 and a supported Cursor build.
- Node.js 22 or newer on PATH. Local testing used 26.7.0.
- The native Claude Code executable and a Claude subscription sign-in with access to the requested models.
- Permission to modify the Cursor installation.

There are no npm dependencies. API-key-only authentication is not supported. Claude Code manages sign-in and token renewal; this project does not read credential files or import browser cookies.

## Install

```powershell
git clone https://github.com/vertexitde/cursor-claude-link.git
cd cursor-claude-link
npm run check
claude auth login --claudeai
npm run doctor
```

Skip the login command if Claude Code is already signed into the correct account. Complete browser sign-in yourself. `doctor` reports selected status and model fields, without printing credentials or account identifiers.

Close Cursor, then install:

```powershell
npm run install:patch
```

Start Cursor again and select a Claude model. The bridge starts with Cursor on `127.0.0.1:43188`. To start it manually, use `npm start`. If you applied the patch while Cursor was open, run **Developer: Reload Window** and start the bridge if needed.

The installer prefers `claude.exe` on PATH, matching the terminal, then tries the native install location. For custom locations, set these before the first installation:

```powershell
$env:CURSOR_APP_ROOT = 'D:\Apps\Cursor\resources\app'
$env:CLAUDE_EXECUTABLE = 'D:\Tools\claude.exe'
npm run check
npm run install:patch
```

`CURSOR_APP_ROOT` points to `resources/app`, not the folder containing `Cursor.exe`. Keep the same value for later status and restore commands. The chosen Claude executable is saved in local `config.json`.

Configuration, installation manifests and backups live in this clone and are ignored by Git. Keep the clone and Node.js at their installation paths while the patch is installed. Unlike cursor-gpt-link, this release does not copy its runtime into a separate state directory. To move the project, restore first and install again from the new location.

## Using it with ChatGPT

Install [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link) first, then this patch. Both patch the same Cursor bundles. The Claude installer preserves the existing ChatGPT changes and updates its installation hashes.

For removal or upgrades, restore Claude first, then restore ChatGPT if needed. Removing Claude returns Cursor to the state immediately before the Claude installation, which can include ChatGPT. Do not remove the underlying ChatGPT patch first and assume the Claude manifest still matches.

Custom public ChatGPT state directories are recognized through `CURSOR_GPT_LINK_HOME`. Set it to the same value used by that installation. Each project still requires support for the selected Cursor build.

## Check, update or remove

```powershell
npm run status
npm run uninstall
```

These correspond to `node patcher.mjs status` and `node patcher.mjs restore`. Status verifies installed-file and backup hashes. Restore refuses to overwrite changed files. Backups remain available.

For a normal project update, close Cursor, restore the patch, run `git pull`, then install again. An already running bridge can remain after restore until stopped or Windows is restarted. Do not share its local key or configuration.

Cursor updates can replace the patched files. **Do not restore old backups over a newer Cursor build.** Check the supported version table and follow [the update notes](docs/testing.md#cursor-updates). There is no force option.

## Remote sessions

In a Remote-SSH window the agent runs on the host, so the host has to reach the bridge. The installer adds a reverse forward to `~/.ssh/config`, inside a marked block it owns:

```
# >>> cursor subscription links: bridge forwarding >>>
Host your-server
    RemoteForward 127.0.0.1:43188 127.0.0.1:43188
# <<< cursor subscription links: bridge forwarding <<<
```

The hosts are the ones you have opened in Cursor that are also declared in your `~/.ssh/config`; nothing else is touched, so ssh to anything outside that list, `git push` included, is unaffected. All three links share the block, each owning the line for its own port, and `npm run restore` removes only its own. A copy of the file as it was before the first change is kept as `config.before-cursor-links`. Use `--ssh-hosts=a,b` to choose the hosts yourself, or `--no-ssh` to leave the file alone.

Two things to know. A second ssh session to the same host cannot bind the port again and ssh prints `remote port forwarding failed`; the session still works, and the first one keeps serving the bridge. And the bridge becomes reachable on that host's loopback, so only forward to hosts you trust with it. The bridge still requires its per-installation key.


### The host's own runtime

The workbench patch is on the client, but four repairs live in the two extension runtimes, and those run wherever the agent runs: reasoning effort and Fast forwarding, the subagent model repair that lets an omitted Task model inherit the parent, the Explore subagent settings, and the receiver for queued follow-ups. In a remote session the host uses its own copy of Cursor under `~/.cursor-server`, so without this step a Task call that omits the optional `model` is rejected there with *Invalid model selection ""*, and the effort you picked is dropped before the request leaves the host.

```powershell
npm run install:remote -- your-server
```

It reads the two bundles over ssh, patches and syntax-checks them on the client, writes them back with a rename and keeps the untouched copy beside each file. `--check` reports what would change without writing, and `--restore` puts the originals back. The three links share one manifest on the host, each adding its own provider, so install them in the same order as locally.

**After the first time this is automatic.** A local install walks the hosts in the ssh block, and every host that already carries the manifest is brought to the new build. A host that was never patched is passed over: installing on a machine is a decision of its own, not a side effect of patching this client. `--no-remote` skips the step.

A Windows host is handled too: its default shell is cmd, so every command travels as an encoded PowerShell script and file contents move as base64 in both directions. `--all` walks the hosts in the ssh block and takes every one that already runs a server for this build; a host you have not opened since the Cursor update has nothing to patch yet, so connect once and run it again.

The remote machine needs no Claude Code installation and no copied credentials: the bridge stays on your PC and the host only talks to it through the forward. The agent there uses the server's own runtime under `~/.cursor-server`, which this patch does not touch, so reasoning effort forwarding and the subagent model repairs are not present on the host yet. End-to-end SSH validation with Claude is still pending.

## How it works

The patch changes both workbench bundles, both agent runtime bundles, main-process startup and the workbench checksum in `product.json`. Only model IDs beginning with `claude-subscription/` use this bridge.

The local bridge accepts bearer-authenticated Responses requests and invokes unmodified Claude Code in print mode. Claude returns structured text and requested function calls. Cursor executes the tools with its existing permissions and sends their results back on the next request.

Claude's built-in tools, hooks, MCP servers and project settings are disabled for these requests. The bridge sends Cursor's instructions, conversation and tool schemas to Claude instead. It does not run a second file-editing agent behind Cursor.

This is a structured-output adapter, not native Anthropic Messages transport. Text is returned once Claude finishes each turn, rather than token by token. Requests include the complete conversation and do not persist Claude Code sessions. The bridge allows two concurrent inference requests and a three-minute timeout per request.

Prompts and tool data go to Anthropic through Claude Code. The bridge does not add request logging. Account credentials stay with Claude Code; only a generated local bridge key is inserted into Cursor. Programs running as your local user can read that key. Never publish configuration, manifests, patched bundles or backups.

## Subscription usage and limitations

The bridge requires `claude.ai` subscription authentication and removes API-key and alternative-provider environment overrides from its child process. There is no API-key fallback.

Anthropic's [Agent SDK support notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), checked in September 2026, says the announced June 15 billing change is paused. Actual billing depends on provider policy, plan, model and enabled extra usage. A successful subscription sign-in does not prove that every model request is included at no extra charge.

In particular, [Fable can use usage credits on some plans](https://code.claude.com/docs/en/model-config#fable-and-usage-credits), and non-interactive Claude Code does not show the interactive billing-consent prompt. Check your account's usage settings before using it.

- Fast mode, voice and image generation are not implemented.
- Ultracode is not an effort level above Max. It combines xhigh reasoning with Claude Code's dynamic workflow orchestration. That orchestration is not implemented in this Cursor adapter, so no misleading Ultracode option is shown. See [Claude's model configuration](https://code.claude.com/docs/en/model-config#adjust-effort-level).
- Initial model entries are embedded during installation. A failed catalog refresh can leave stale entries visible; the provider still decides whether a request is accepted.
- Claude Code authentication, catalog and usage behavior can change separately from Cursor. A refresh-lock error can require retrying later or signing in again through Claude Code.
- Cloud agents, macOS and Linux clients are unsupported. Separate manual coverage of both Cursor windows and SSH is still needed.

## Reconnecting or failed requests

Claude CLI errors now use the error event understood by Cursor's Responses adapter. Earlier bridge versions sent `response.failed`, which Cursor 3.20.11 ignored and treated as an interrupted stream. This could hide login, usage-limit or timeout errors behind repeated reconnect attempts. The correction reports the original error; it does not resolve an expired login, exhausted usage or a broken SSH connection.

Model discovery now closes the Claude CLI input stream and waits for a clean exit before returning the catalog, so it no longer kills a successful discovery process during cleanup. If Claude reports a missing sign-in, run `claude auth login --claudeai` locally, then retry the request.

The local `.state/bridge-status.json` file records up to 40 request lifecycle entries with model, timestamp, duration, outcome and numeric usage diagnostics. It contains no prompts, tool arguments, credentials or error text. The file is ignored by Git.

## Attachments

Images (PNG, JPEG, GIF and WebP) and PDFs are sent to Claude Code as native content blocks through streaming JSON input. UTF-8 text attachments, including Markdown, CSV and JSON, are sent as text documents. Attachments retain their position in the conversation and can also be included in tool results. The bridge does not place base64 file data in the text prompt or read local paths from attachment URLs.

Both workbenches advertise image support. Cursor decides how files are attached or extracted before a request reaches the bridge. Other binary formats, audio, video and provider-specific file IDs are not supported by this Claude adapter. Attach file contents, an HTTP(S) URL, or extracted text. The bridge accepts requests up to 64 MiB including JSON and base64 overhead; Claude's own file, page and context limits still apply.

Run `npm run test:attachments` against the running bridge for a real image and PDF content check. It consumes subscription usage.

## Context usage

Cursor receives the input token count from the last Claude model step, including cache reads and writes. Earlier bridge versions reported the cumulative input usage of all internal steps, which could make a short conversation appear to fill the context window. Duplicate message IDs and subagent usage are excluded from this calculation. Older CLI versions without final per-step output counts use the turn output total as a conservative fallback.

An existing conversation keeps its saved context value until the next successful response. The local diagnostics include token counts, prompt character count, attachment count and embedded image-data character count, without storing prompt or attachment contents.

## Development

```powershell
npm test
npm run check:source
```

Unit tests use synthetic data and do not make model requests. The optional `npm run test:live` requires the running bridge and consumes subscription usage. It checks a tool call and its result. Set `CLAUDE_TEST_MODEL` to a catalog value to select a different model.

No Cursor binaries, full bundled source, model caches or account files are distributed. When reporting a problem, include the Cursor version and commit, operating system, Node.js and Claude Code versions, and a redacted error. See [SECURITY.md](SECURITY.md) for sensitive reports.

## Legal Disclaimer & Terms of Service Notice

- **Educational & PoC Only:** This project is an independent open-source proof-of-concept for educational purposes.
- **No Affiliation:** This project is not affiliated with, maintained, sponsored, or endorsed by Anysphere (Cursor) or Anthropic.
- **Use at Your Own Risk:** Modifying software binaries or patching client environments may violate the Terms of Service of Cursor and/or Anthropic.
- **Account Safety:** The maintainers are not responsible for suspended accounts, lost access, or any damages caused by using this patch.

## License

The patcher and bridge source are provided under the [MIT license](LICENSE). The Claude icon has a separate license and attribution in [third-party notices](THIRD_PARTY_NOTICES.md).
