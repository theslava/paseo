# Plan: Display Full OMP `/context` Breakdown in Paseo

## Background

**What OMP's `/context` shows today (8 pieces):**

| #   | Category                       | Description                                       |
| --- | ------------------------------ | ------------------------------------------------- |
| 1   | System prompt tokens           | Tokenized system-prompt text                      |
| 2   | System tools tokens            | Tool schema JSON tokenized                        |
| 3   | System context tokens          | Context files (AGENTS.md, RULES.md, etc.)         |
| 4   | Skills tokens                  | Registered skill descriptions                     |
| 5   | Messages tokens                | Conversation history messages                     |
| 6   | Auto-compact buffer            | Reserved space before auto-compaction fires       |
| 7   | Free tokens                    | Remaining headroom after used + buffer            |
| 8   | Snapcompact savings (optional) | Estimated wire savings from imaging large content |

Plus summary: **context window total**, **used %**.

Source: `oh-my-pi-inspect/packages/coding-agent/src/slash-commands/helpers/context-report.ts` → `computeContextBreakdown()`.

**What Paseo shows today:**

The `ContextWindowMeter` component receives only `maxTokens` and `usedTokens` — renders a single circular progress ring with percentage. The tooltip fetches provider-level quota data (separate API).

Data flow: OMP RPC `get_session_stats` / `get_state` → `OmpSessionStatsSchema.contextUsage` (`tokens`, `contextWindow`, `percent`) → `mapOmpUsage()` adds `contextWindowMaxTokens`/`contextWindowUsedTokens` to `AgentUsage` → WebSocket `usage_updated` event → app agent state `.lastUsage` → UI.

## Gap Analysis

The breakdown categories are computed by OMP's internal `computeContextBreakdown(session)` which walks the session's message list, system prompt array, tools, and skills. This logic lives inside OMP's TUI layer and is **not exposed via the ACP/RPC protocol** that Paseo uses.

Currently available over RPC:

```jsonc
// get_session_stats response (OmpSessionStats)
{
  "tokens": { "input": N, "output": N, "cacheRead": N, ... },
  "cost": N,
  "contextUsage": { "tokens": N, "contextWindow": N, "percent": N }
}
```

No category-level token counts. The schemas use `.passthrough()`, so extra fields from newer OMP versions won't break parsing — but a new binary version needs to actually send them.

## Architecture Decision

**Approach**: Add a new RPC command `get_context_breakdown` to OMP, then consume it in Paseo.

This requires changes in both repos:

### OMP side (`oh-my-pi-inspect`)

1. Expose `getContextBreakdown()` result as a new RPC command `get_context_breakdown`
2. Return `{ categories: [...], usedTokens, freeTokens, autoCompactBufferTokens, contextWindow }`

### Paseo side (this PR / follow-up)

3. Protocol type extension (backward-compatible)
4. Server-side OMP provider consumption
5. UI component enhancement

## Implementation Plan

### Phase 0: OMP-side RPC exposure (`oh-my-pi-inspect`) **[BLOCKER]**

**Goal:** Expose `computeContextBreakdown()` over the ACP/RPC protocol so Paseo can request it. Without this, Phases 1–3 have no data source and are wasted effort.

#### 0a. Add new RPC command

- **File:** `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- Add `{ type: "get_context_breakdown" }` to `RpcCommand` union.

#### 0b. Handle the command

- **File:** `packages/coding-agent/src/modes/rpc/rpc-mode.ts` or wherever commands are dispatched
- Route `get_context_breakdown` to call `computeContextBreakdown(session)` and return result as JSON.

#### 0c. Define response shape

```ts
interface ContextBreakdownResponse {
  contextWindow: number;
  usedTokens: number;
  freeTokens: number;
  autoCompactBufferTokens: number;
  categories: Array<{
    id: string;
    label: string;
    tokens: number;
  }>;
}
```

### Phase 1: Protocol & Types (Paseo)

**Goal:** Wire up the data contract so the server→app pipeline carries breakdown data when available.

#### 1a. Extend `AgentUsage` type
- Add optional fields to `AgentUsage`:
  ```ts
  // Context breakdown categories (OMP /context slash command data)
  contextBreakdown?: {
    systemPromptTokens?: number;
    systemToolsTokens?: number;
    systemContextTokens?: number;
    skillsTokens?: number;
    messagesTokens?: number;
    autoCompactBufferTokens?: number;
    freeTokens?: number;
  };
  ```
- Update `AgentUsageSchema` Zod schema in `messages.ts` to match.
- All optional → backward-compatible with old daemons and clients.

#### 1b. Extend server SDK types

- **File:** `packages/server/src/server/agent/agent-sdk-types.ts`
- Mirror the new `contextBreakdown` field on the internal `AgentUsage`.

#### 1c. OMP provider: parse breakdown from RPC response

- **File:** `packages/server/src/server/agent/providers/omp/rpc-types.ts`
- Extend `OmpSessionStatsSchema.contextUsage` to accept passthrough category fields (already `.passthrough()`, so no change needed for receiving).
- Define a typed interface for what we expect when OMP supports it.

- **File:** `packages/server/src/server/agent/providers/omp/usage-mapper.ts`
- After mapping `contextWindowMaxTokens`/`contextWindowUsedTokens`, also map any breakdown categories present in the passthrough data into `contextBreakdown`.

### Phase 2: Server-side RPC call (Paseo, needs OMP support)

**Goal:** Request context breakdown from OMP during usage refresh.

#### 2a. Add RPC command type

- **File:** `packages/server/src/server/agent/providers/omp/runtime.ts` + `cli-runtime.ts`
- Add optional `getContextBreakdown()` method to `OmpRuntimeSession` interface.
- Implement in `CliRuntime`: send `{ type: "get_context_breakdown" }`, parse response through new schema.
- Graceful fallback: if the RPC isn't supported by this OMP version, return `undefined`. The provider already handles missing stats gracefully.

#### 2b. Wire into usage refresh

- **File:** `packages/server/src/server/agent/providers/omp/agent.ts`
- In `refreshAfterTurn()`, after fetching session stats, also attempt `getContextBreakdown()`.
- Merge breakdown into the `AgentUsage` emitted via `usage_updated`.

### Phase 3: UI Enhancement (App)

**Goal:** Display the full context breakdown alongside or instead of the simple progress ring.

#### 3a. Extend ContextWindowMeter component

- **File:** `packages/app/src/components/context-window-meter.tsx`
- Accept new `contextBreakdown` prop from agent state.
- When available, expand the tooltip/expanded view to show a category breakdown:
  - Each category as a horizontal bar segment with label and token count
  - Color-coded matching OMP's TUI colors (system prompt = accent, tools = warning, etc.)
  - Free tokens and auto-compact buffer shown separately at bottom
- Keep the existing compact ring for percentage — the breakdown is additional detail in an expanded/pressed state.

#### 3b. Wire data through app composer

- **File:** `packages/app/src/composer/index.tsx`
- Extract `lastUsage.contextBreakdown` from agent state and pass to `renderContextWindowMeter` → `ContextWindowMeter`.

#### 3c. Breakdown display component

- **New file:** `packages/app/src/components/context-breakdown-view.tsx`
- Reusable component that renders the categorized bars.
- Categories with 0 tokens are hidden (matching `/context` behavior).
- Uses same `formatTokenCount` utility already in the codebase.
- Responsive layout: on compact form factor, shows only top-level categories; on larger screens, full detail.


## File Inventory

| File                                                                | Change                                             |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/protocol/src/agent-types.ts`                              | Extend `AgentUsage` interface                      |
| `packages/protocol/src/messages.ts`                                 | Extend `AgentUsageSchema` Zod schema               |
| `packages/server/src/server/agent/agent-sdk-types.ts`               | Mirror `contextBreakdown` on internal `AgentUsage` |
| `packages/server/src/server/agent/providers/omp/rpc-types.ts`       | Add breakdown response type/schema                 |
| `packages/server/src/server/agent/providers/omp/runtime.ts`         | Add `getContextBreakdown()` to interface           |
| `packages/server/src/server/agent/providers/omp/cli-runtime.ts`     | Implement RPC call with fallback                   |
| `packages/server/src/server/agent/providers/omp/usage-mapper.ts`    | Map breakdown into `AgentUsage`                    |
| `packages/server/src/server/agent/providers/omp/agent.ts`           | Call `getContextBreakdown()` during refresh        |
| `packages/app/src/components/context-window-meter.tsx`              | Accept + display breakdown data                    |
| `packages/app/src/components/context-breakdown-view.tsx`            | New: category bar chart component                  |
| `packages/app/src/composer/index.tsx`                               | Wire breakdown through to meter                    |
| `oh-my-pi-inspect/packages/coding-agent/src/modes/rpc/rpc-types.ts` | Add RPC command type                               |
| `oh-my-pi-inspect/packages/coding-agent/src/modes/rpc/rpc-mode.ts`  | Route new RPC command                              |

## Dependencies & Ordering

**Phase 0 must land first.** The Paseo-side changes (Phases 1–3) have no data source without the OMP RPC exposure. Once Phase 0 ships in an OMP release, Phases 1–3 activate automatically via the graceful fallback path.

## Risks

- **OMP binary compatibility**: Graceful fallback built in — if `get_context_breakdown` isn't supported, usage still works with just window/used tokens.
- **UI density**: Breakdown adds visual complexity. Mitigated by showing it only on expand/press, keeping compact view unchanged.
- **Token count accuracy**: OMP's internal counts are estimates (same tokenizer as LLM API). Display them as "estimated" rather than exact billing figures.
