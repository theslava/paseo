# Oh My Pi (OMP) Provider Gap Analysis

**Date:** 2026-07-23  
**Source:** [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) via DeepWiki + Paseo codebase audit (`packages/server/src/server/agent/providers/omp/`)

## Overview

This document catalogs every JSON-RPC command, extension UI method, and feature that OMP exposes over its `--mode rpc-ui` protocol but is **not implemented** in Paseo's OMP provider adapter. The analysis compares OMP's documented RPC surface against Paseo's wire schema (`rpc-types.ts`), CLI runtime bridge (`cli-runtime.ts`), agent session logic (`agent.ts`), and capability flags.

---

## Missing RPC Commands

### High Impact

| Command                | Parameters                                   | Description                                                                                   | Why It Matters                                                                                                                                             |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`abort_and_prompt`** | `message: string`, `images?: ImageContent[]` | Atomically aborts current activity AND sends a new prompt                                     | Eliminate race condition between separate `abort()` then `prompt()` calls; prevents orphaned turns where a new message lands before the abort takes effect |
| **`new_session`**      | `parentSession?: string`                     | Creates a new session within an existing RPC connection, optionally inheriting parent context | Enables fork workflows without process restart; critical for branching conversations or creating child sessions from a live parent                         |
| **`set_todos`**        | `phases: TodoPhase[]`                        | Programmatically sets todo/task phases on the agent                                           | Currently todos are read-only (received via `todo_reminder` events). Write-back lets users edit the agent's task list directly from Paseo's UI             |
| **`switch_session`**   | `sessionPath: string`                        | Hot-swaps to a different session file within the same connection                              | No need to kill/restart processes when switching contexts; enables tab-like navigation between OMP sessions                                                |

### Medium Impact

| Command                               | Parameters                                  | Description                                            | Why It Matters                                                                                                                                 |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **`get_subagents`**                   | none                                        | Snapshot of currently tracked subagents                | Subagent data flows through events only today. Polling endpoint enables on-demand inspection, recovery after reconnect, and initial state sync |
| **`get_subagent_messages`**           | `subagentId?`, `sessionFile?`, `fromByte?`  | Fetch transcript entries for a specific subagent       | Schema exists in test harness (`fake-omp.ts`) but not wired to real runtime. Needed for historical subagent transcript retrieval               |
| **`prompt` with `streamingBehavior`** | `streamingBehavior?: "steer" \| "followUp"` | Auto-queues prompt as steer/follow-up if agent is busy | Without this, prompts arriving during active streaming may be rejected instead of gracefully queued                                            |
| **`set_host_uri_schemes`**            | `schemes: RpcHostUriSchemeDefinition[]`     | Registers custom URI schemes the host can resolve      | Enables deep linking (e.g., `paseo://agent/...`) from OMP back into the Paseo app                                                              |
| **`export_html`**                     | `outputPath?: string`                       | Exports session history as HTML file                   | Session archival/sharing capability                                                                                                            |
| **`set_session_name`**                | `name: string`                              | Renames the current session programmatically           | Cannot change session names from Paseo UI today                                                                                                |

### Low Impact / Convenience

| Command                       | Parameters           | Description                                                                            |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| **`cycle_model`**             | none                 | Cycles to next available model (convenience; Paseo uses explicit `set_model`)          |
| **`cycle_thinking_level`**    | none                 | Cycles through thinking levels (convenience; Paseo uses explicit `set_thinking_level`) |
| **`get_last_assistant_text`** | none                 | Returns last assistant text without fetching full message list                         |
| **`bash`**                    | `command: string`    | Execute bash command directly via RPC (bypasses agent tool system)                     |
| **`abort_bash`**              | none                 | Aborts running bash command sent via RPC                                               |
| **`set_auto_retry`**          | `enabled: boolean`   | Enable/disable automatic retry for failed operations                                   |
| **`abort_retry`**             | none                 | Cancel any pending retry operation                                                     |
| **`get_login_providers`**     | none                 | Lists available login providers                                                        |
| **`login`**                   | `providerId: string` | Initiates login with specified provider                                                |

---

## Missing Steering/Follow-up/Interrupt Modes

OMP exposes three configuration knobs that control how queued messages and interrupts are processed. None are exposed by Paseo's adapter:

| Command                  | Parameters                       | Description                                                               |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------- |
| **`set_steering_mode`**  | `mode: "all" \| "one-at-a-time"` | Controls whether steer messages are batched or delivered sequentially     |
| **`set_follow_up_mode`** | `mode: "all" \| "one-at-a-time"` | Controls whether follow-up messages are batched or delivered sequentially |
| **`set_interrupt_mode`** | `mode: "immediate" \| "wait"`    | Controls whether abort is immediate or waits for a safe checkpoint        |

These affect the semantics of every `steer`, `followUp`, and `abort` call. Without explicit mode settings, OMP uses its defaults.

---

## Extension UI Methods Not Handled

Paseo handles these extension UI methods from `rpc-ui-permission-mapper.ts`:

- ✅ `select` — mapped to permission questions
- ✅ `confirm` — mapped to approval dialogs
- ✅ `input` — mapped to text input questions (with optional comment chaining)
- ✅ `open_url` — rendered as assistant message with link

The following methods exist in OMP but are **not handled**:

| Method                | Purpose                                    | Impact                                                                            |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| **`editor`**          | Multi-line code/text editor dialog         | Extensions requesting structured editing fall back to generic handling or timeout |
| **`notify`**          | Non-blocking notification/toast from agent | Notifications silently dropped; no toast shown in Paseo                           |
| **`setStatus`**       | Sets status bar message on host UI         | Status updates invisible in Paseo interface                                       |
| **`setWidget`**       | Renders custom widget in host UI           | Custom widgets cannot render in Paseo panels                                      |
| **`setTitle`**        | Changes window/tab title                   | Title changes ignored                                                             |
| **`set_editor_text`** | Pre-fills editor with default text         | Editor pre-fill not supported                                                     |
| **`cancel`**          | Cancels a previously issued UI request     | May be treated as unknown method if received                                      |

---

## Missing Response Fields

### Extension UI Response: `timedOut` Flag

OMP's `extension_ui_response` accepts an optional `timedOut?: boolean` field. Paseo's schema only sends `{ value?, confirmed?, cancelled? }`. This means:

- If Paseo wants to signal that a response timed out (vs. explicit user cancel), OMP cannot distinguish between the two cases.
- Affects retry behavior, session state persistence, and how extensions interpret abandoned dialogs.

---

## Capability Flags Explicitly Disabled

From `agent.ts`:

```typescript
const OMP_CORE_CAPABILITIES = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsSessionListing: true,
  supportsDynamicModes: true,
  supportsMcpServers: false, // ← MCP server passthrough disabled
  supportsReasoningStream: true,
  supportsToolInvocations: true,
  supportsRewindConversation: true, // via branch()
  supportsRewindFiles: false, // ← File-only rewind not supported
  supportsRewindBoth: false, // ← Combined file+conversation rewind not supported
};

// withOmpCapabilities() also adds:
// supportsNativePaseoTools:       true
```

| Flag                         | Status       | Notes                                                                                                                                  |
| ---------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `supportsMcpServers: false`  | **Disabled** | Other providers pass through user-defined MCP servers to their backends. OMP does not receive MCP config from Paseo today.             |
| `supportsRewindFiles: false` | **Disabled** | File-only rewind (restore files without rewinding conversation) is not implemented. Conversation rewind via `branch()` IS implemented. |
| `supportsRewindBoth: false`  | **Disabled** | Combined file + conversation rewind is not implemented.                                                                                |

---

## Feature Gaps vs. Other Providers

### Plan Mode

Claude Code and Codex both support plan-only modes where the agent proposes changes but doesn't execute them until approved. OMP has no equivalent feature gate in the provider. The `handoff` command bridges planning→implementation within a session, but there's no "plan-only" session mode.

### Web Search Injection

Other providers can be configured with web search capabilities (`webSearch?`). No evidence of OMP receiving web search tool registration from Paseo beyond what OMP provides itself internally.

### Sandbox/Network Access Controls

Paseo supports per-agent sandbox mode and network access restrictions at launch time. Whether these are respected by OMP when launched via `--mode rpc-ui` depends on OMP's own CLI flag handling — not controlled by the adapter.

---

## Missing Runtime Events

OMP emits these outbound events over `stdout` in `--mode rpc-ui` that are **not present** in Paseo's `OmpRuntimeEventSchema` discriminated union (line 458–486). Any event not in the union fails Zod `.safeParse()` at `cli-runtime.ts:97` and is silently dropped — never reaching the agent session handler.

### Silently Dropped by Schema Validation

These events exist in OMP's protocol but have no entry in `OmpRuntimeEventSchema`. They parse as unknown and are discarded before any handler sees them.

| Event Type                   | Payload                              | Description                                                             | Impact of Being Dropped                                                                                                  |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **`turn_end`**               | final message, tool results          | Marks end of an LLM reasoning cycle with turn-level summary             | No visibility into turn boundaries; cannot compute per-turn latency or token counts from events alone                    |
| **`thinking_level_changed`** | new thinking level                   | Thinking budget changed during execution (e.g., via slash command)      | UI won't reflect mid-session thinking level changes; stale indicator shown to user                                       |
| **`ttsr_triggered`**         | context about stop-reasoning trigger | "Time To Stop Reasoning" fired when model exceeded its reasoning budget | Silent loss of information about why long-thinking turns were cut short                                                  |
| **`todo_auto_clear`**        | none                                 | All todos automatically cleared after completion                        | Paseo doesn't learn that the agent finished all tasks on its own; todo panel may show stale completed items indefinitely |
| **`host_uri_request`**       | URI, read/write mode, data           | OMP asks host to resolve a custom URI scheme for file/data access       | Custom URI schemes registered by extensions cannot reach back into Paseo                                                 |
| **`host_uri_cancel`**        | request ID                           | Aborts a pending `host_uri_request`                                     | Paired cancellation signal lost; dangling requests not cleaned up                                                        |
| **`extension_error`**        | error details from extension runtime | Extension threw an error during execution                               | Extension failures invisible in Paseo timeline; no notification or diagnostic surfaced                                   |
| **`session_info_update`**    | session metadata update              | Session config changed (model, settings, etc.)                          | Metadata changes made inside OMP don't propagate to Paseo's session view                                                 |
| **`config_update`**          | configuration change payload         | Agent config changed at runtime                                         | Config mutations invisible; Paseo state diverges from OMP internal state                                                 |

### Schema-Present But Not Handled in Agent Logic

These events are in `OmpRuntimeEventSchema` and parse successfully, but have **no handler** in `agent.ts`'s event dispatch pipeline. They arrive at the subscriber layer but produce no observable effect.

| Event Type                                                | Where Parsed               | Handler?                        | Notes                                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`notice`**                                              | ✅ `OmpRuntimeEventSchema` | ❌ No handler in agent dispatch | Parsed by `event-mapper.ts` → `mapNoticeEvent()`, but the mapping is never called from the main event loop. Notice events with level `"warning"` or `"error"` are lost entirely. |
| **`goal_updated`**                                        | ✅ `OmpRuntimeEventSchema` | ❌ No handler in agent dispatch | Parsed by `event-mapper.ts` → `mapGoalUpdatedEvent()`, but not wired into `agent.ts`. Goal budget/progress tracking invisible.                                                   |
| **`auto_retry_start` / `auto_retry_end`**                 | ✅ `OmpRuntimeEventSchema` | ❌ No handler in agent dispatch | Mapped to timeline items in `event-mapper.ts` but never invoked from the event loop. Retry activity invisible.                                                                   |
| **`retry_fallback_applied` / `retry_fallback_succeeded`** | ✅ `OmpRuntimeEventSchema` | ❌ No handler in agent dispatch | Same pattern: mapper exists, dispatch doesn't call it. Model fallbacks silent.                                                                                                   |
| **`auto_compaction_start` / `auto_compaction_end`**       | ✅ `OmpRuntimeEventSchema` | ❌ No handler in agent dispatch | Compaction progress invisible beyond the base session-level `compaction_start`/`compaction_end` events.                                                                          |
| **`host_tool_cancel`**                                    | ✅ `OmpRuntimeEventSchema` | ⚠️ Partially handled            | Schema present and parsed; cancellation arrives at subscribers but may not reach all host tool cleanup paths.                                                                    |

### Event Handling Architecture Gap

The core issue is a two-layer gap:

1. **Schema layer (`rpc-types.ts`)** — Events missing from `OmpRuntimeEventSchema` are dropped at parse time in `cli-runtime.ts:97`. They never leave the JSONL transport.
2. **Dispatch layer (`agent.ts`)** — Events that pass schema validation flow to the subscriber callback, but only specific types have handlers wired into the event loop. The `event-mapper.ts` file contains mapping functions for notice/goal/retry/compaction events, but these mappings are standalone utilities not called from the main dispatch path.
   This means `event-mapper.ts` has eight unreachable mapping functions (`mapNoticeEvent`, `mapGoalUpdatedEvent`, `mapAutoRetryStartEvent`, `mapAutoRetryEndEvent`, `mapRetryFallbackAppliedEvent`, `mapRetryFallbackSucceededEvent`, `mapAutoCompactionStartEvent`, `mapAutoCompactionEndEvent`) that exist as standalone utilities but are never called from the main agent event dispatch path.

## Commands Defined But Not Actively Used

These commands exist in Paseo's wire schema and runtime bridge but are never called during normal agent operation:

| Command               | Where Defined                      | Status                                                                                                                      |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `get_messages`        | Schema ✅, CLI method ✅, Agent ❌ | Parsed but never invoked from `agent.ts`. Messages arrive via streaming events. Available for recovery/reconnect scenarios. |
| `get_branch_messages` | Schema ✅, CLI method ✅, Agent ❌ | Only `branch()` is actively called. Branch message retrieval exists but isn't used post-branch.                             |

These aren't broken — they're latent API surface that could serve reconnect/recovery paths or explicit history fetching.

---

## Wire Protocol Details

### Transport

OMP uses JSONL (JSON Lines) over child process stdio. Each line is a single JSON object with a `type` field discriminating command vs. event. Requests carry an auto-generated `id`; responses match `{ type: "response", id, success, data? }`. Fire-and-forget messages use `process.send()` without request tracking.

### Key Files

| File                   | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `rpc-types.ts`         | All Zod schemas for commands, events, models, sessions                 |
| `cli-runtime.ts`       | Bridges `OmpRuntimeSession` interface to JSONL wire calls              |
| `agent.ts`             | Session lifecycle, event handling, permission bridging, slash commands |
| `event-mapper.ts`      | Maps OMP runtime events to Paseo timeline items                        |
| `host-tools.ts`        | Native Paseo tool registration and routing                             |
| `commands.ts`          | Slash command mapping from OMP to Paseo format                         |
| `jsonl-rpc-process.ts` | Provider-neutral JSONL transport layer (shared with Pi)                |

---

## Recommendations by Priority

### P0 — Correctness / Race Conditions

1. **Implement `abort_and_prompt`** — Replaces the two-call `abort()` → `prompt()` sequence that has a race window where new prompts land before abort takes effect.

2. **Add `streamingBehavior` to `prompt` schema** — Allows graceful queuing when agent is busy instead of rejection.

### P1 — User-Visible Features

3. **Wire `set_todos`** — Enable write-back of todo/task phases. High user value: editing task lists from the UI is a natural extension of reading them.

4. **Handle `editor` extension UI method** — Multi-line editor dialogs are commonly used by extensions for structured input. Currently falls back or times out.

5. **Implement `new_session`** — Session forking without process restart enables branching conversations, child sessions, and "start fresh" workflows.

6. **Wire `get_subagents` + `get_subagent_messages`** — On-demand subagent inspection complements event streaming; needed for recovery and initial sync.

### P2 — Quality of Life

7. **Handle remaining extension UI methods** (`notify`, `setStatus`, `setTitle`, `setWidget`, `set_editor_text`, `cancel`) — Each adds polish but none blocks core functionality.

8. **Add `timedOut` field to extension UI responses** — Lets OMP distinguish timed-out dialogs from explicit cancels.

9. **Expose steering/follow-up/interrupt modes** — Gives control over message queue semantics and abort behavior.

10. **Implement `switch_session` / `export_html` / `set_session_name`** — Nice-to-have session management features.

### P3 — Parity with Other Providers

11. **MCP server passthrough** (`supportsMcpServers: true`) — Enables user-defined MCP servers flowing into OMP like they do for other providers.

12. **Plan mode** — Add plan-only session capability matching Claude Code/Codex.

13. **File rewind** (`supportsRewindFiles: true`) — Restore files without rewinding conversation history.

---

## Appendix: Complete Command Inventory

### All Commands Paseo Currently Implements

| Command                     | Params                               | Response?              |
| --------------------------- | ------------------------------------ | ---------------------- |
| `prompt`                    | `message`, `images?`                 | ✅ (ack)               |
| `compact`                   | `customInstructions?`                | ✅                     |
| `set_auto_compaction`       | `enabled`                            | ✅                     |
| `abort`                     | none                                 | ✅                     |
| `get_state`                 | none                                 | ✅                     |
| `get_messages`              | none                                 | ✅ (unused at runtime) |
| `get_available_models`      | none                                 | ✅                     |
| `set_model`                 | `provider`, `modelId`                | ✅                     |
| `set_thinking_level`        | `level`                              | ✅                     |
| `get_session_stats`         | none                                 | ✅                     |
| `get_available_commands`    | none                                 | ✅                     |
| `set_subagent_subscription` | `level`                              | ✅                     |
| `set_host_tools`            | `tools[]`                            | ✅                     |
| `branch`                    | `entryId`                            | ✅                     |
| `get_branch_messages`       | none                                 | ✅ (unused at runtime) |
| `handoff`                   | `customInstructions?`                | ✅                     |
| **Fire-and-forget:**        |                                      |                        |
| `steer`                     | `message`, `images?`                 | ❌                     |
| `follow_up`                 | `message`, `images?`                 | ❌                     |
| `extension_ui_response`     | `id`, `value?/confirmed?/cancelled?` | ❌                     |
| `host_tool_result`          | tool result data                     | ❌                     |
| `host_tool_update`          | tool update data                     | ❌                     |

### All Events Paseo Handles

All events in `OmpRuntimeEventSchema` are consumed: agent lifecycle, message streaming, tool execution, compaction, extension UI requests, command output, prompt results, process exit, subagent lifecycle/progress/events, todo reminders, notices, goal updates, auto-retry start/end, retry fallback applied/succeeded, auto-compaction start/end, available commands updates, and host tool call/cancel/update.
