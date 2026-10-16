# Changelog

All notable changes to this project are documented in this file.
The format follows Keep a Changelog.

## [Unreleased]

### Added

- Showed subscription usage on the Claude and ChatGPT picker sections, using the window closest to its limit.

### Fixed

- Claude and ChatGPT subscription models on This Mac (Remote Control) now show a clear error pointing to This Mac, instead of failing in Cursor's cloud create RPC with `BAD_MODEL_NAME`. Remote Control agents must be created in the cloud and the cloud cannot reach the local bridge. Cursor-native models, Cloud and Remote Machine targets are unchanged.
- Added Cursor 3.22.12 support on Apple Silicon with captured original Mac hashes and updated model-picker, routing, usage-card and subagent symbols.
- Updated native validation to follow the current Responses adapter symbols and the task factory's `availableModels` contract.
- Kept Claude MAX and Explore helpers separate from GPT helpers so a combined installation produces valid workbench and runtime modules while preserving both providers.
- Routed subscription turns through Cursor's existing local execution strategy when Agent Host is enabled, covering new turns, resume and summarization without changing ordinary-model routing.
- Registered the native execution provider through Agent Host's existing shared runtime, preserving host options and cleanup ownership; subscription turns now report a compatibility error in temporarily unsupported independent Agent Host modes.
- Combined GPT-first install now records `claudeManifest` on the linked GPT manifest, uses a Claude-specific task-props native wrapper so GPT's wrapper stays callable, and skips the 0444 permission assertion when tests run as root.
- `selectedModelIds` now keeps only Explore IDs that start with this provider prefix, so a foreign selection is not added to the Claude catalog.
- Serialized Explore and Task-bubble helpers no longer close over Node imports (`requireSubscriptionPrefix`, `CLAUDE_PREFIX`). Patchers still validate the prefix; bubbles emit `CLAUDE_PREFIX` into the workbench bundle.
- `--restore` reads the existing `installed.json` first and no longer requires `getBuild()` to succeed, so a leftover 3.20.17 patch can be uninstalled after this checkout moved to a newer supported build.
- Tested the combined-install GPT overlay separately and through the verified Mac build preflight.
- Skipped linked GPT restore when that checkout's `installed.json` is gone, even if the parent directory still exists. Do not recreate an archived GPT manifest.
- `check:actions` now asserts the same derived runtime insertions the 3.21 patcher writes, instead of pinning `_` / `e,r,s`.
- Privatized Cursor.app to `0700` on every version installer before writing the bridge key into workbench assets, matching 3.20.17. Rollback restores recorded `appMode`.
- Made version `--restore` retryable after a partial copy by accepting already-restored `originalHash` targets, and restored linked GPT manifests from saved `linked.original` without aborting if that checkout is gone. `install.mjs` still archives `installed.json` after re-sign. Linked GPT writes ignore only `ENOENT`; other filesystem errors still abort. Every version installer records `appMode` from `requireWritableApp`.
- Advertised Cursor MAX-switch metadata only on versions that install `patchMaxMode`; 3.20.17 still exposes the Context dropdown and 200K/1M display split.
- Wired `verifySubagentSettings` into `check:subagents` and failed closed on unknown `lifecycleSymbols` versions.
- Left `installed.json` in place during version `--restore` so the macOS wrapper can re-sign Cursor, and hash-checked companion GPT manifests only on overlapping paths.
- Kept top-level `context_window` on `/v1/models` next to `capabilities.context_length` for Cursor 3.20.17 clients.
- Enabled installation in Cursor 3.20.17 on macOS Apple Silicon with verified Mac hashes and Apple code signing that preserves hardened runtime and entitlements.
- Kept restoration retryable through signing failures and preserved a companion ChatGPT installation when removing Claude.
- Preserved the active restoration manifest when a combined installation is installed again.
- Checked the installed executable for Apple Silicon support and restored recorded app permissions after standalone removal.
- Corrected companion discovery, Rosetta detection, exact bridge restart matching and private startup diagnostics.
- Routed Cursor tool requests through distinct transport names so Claude does not confuse them with its disabled built-in tools.

### Changed

- Matched the agent-exec activation and subagent transcript anchors by shape instead of minified name, so a rename-only Cursor build no longer breaks them.

- Target only Cursor 3.22.12 with verified Mac metadata and one install/restore/write pipeline and symbol-table row.
- Restricted installation to the verified macOS build; unknown versions, commits and file hashes remain rejected.
- Patched the selected app directly, without requiring a full-app backup.
- Synced upstream Explore settings, context/MAX, subagent lifecycle and queued follow-up patches, then ported their symbols to the verified Mac build.
