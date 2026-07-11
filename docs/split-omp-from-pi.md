# Plan: Split OMP from Pi — Independent Provider

## Goal

Make Oh My Pi (OMP) its own standalone provider, fully decoupled from Pi. Currently OMP is a derived provider that reuses the Pi adapter with only the binary name (`"omp"` vs `"pi"`), session directory default, and RPC command type differing. After this change both providers exist independently with their own implementation files but share generic runtime/history/tool-call modules.

## Branch

Create and work on branch `feat/split-omp-from-pi`.

---

## Current State Summary

| Aspect                 | Before                                                                                               | After                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `provider-registry.ts` | "omp" factory wraps `PiRpcAgentClient` with overridden command/params/RPC type                       | New "omp" factory creates `OmpRpcAgentClient` directly |
| Three differences      | command → `"omp"`, sessionDir → `"~/.omp/agent/sessions"`, **RPC type → `"get_available_commands"`** | Each lives in its own client class constructor         |
| Provider definition    | Built-in in `AGENT_PROVIDER_DEFINITIONS`, disabled by default                                        | Independent built-in, disabled by default              |
| Implementation         | Single `providers/pi/` directory shared by both                                                      | `providers/pi/` for Pi, `providers/omp/` for OMP       |
| Provider string        | Both emit `"pi"` internally                                                                          | Pi emits `"pi"`, OMP emits `"omp"`                     |
| Derived relationship   | None currently used (`derivedFromProviderId: null`)                                                  | N/A — no longer derived                                |

> **Note:** There are zero instances of `derivedFromProviderId === "pi"` filtering logic anywhere. The test fixture at `agent-manager.test.ts:6688` sets it to `"pi"` but that's test data only — production code never special-cases derived-from-pi behavior. No COMPAT shim removal is needed.

---

## Files to Create (copy from pi → omp)

### 1. `packages/server/src/server/agent/providers/omp/agent.ts`

Copy of `providers/pi/agent.ts`. Rename all Pi identifiers to OMP:

- `PI_` constants → `OMP_`:
  - `PI_PROVIDER` → `OMP_PROVIDER = "omp"`
  - `DEFAULT_PI_THINKING_LEVEL` → `DEFAULT_OMP_THINKING_LEVEL`
  - `PI_BINARY_COMMAND` → `OMP_BINARY_COMMAND` (env vars: `process.env.OMP_COMMAND ?? process.env.OMP_ACP_OMP_COMMAND ?? "omp"`)
  - `PI_CATALOG_REQUEST_TIMEOUT_MS` → `OMP_CATALOG_REQUEST_TIMEOUT_MS`
  - `PASEO_PI_TREE_EXTENSION_COMMAND` → `OMP_PASEO_TREE_EXTENSION_COMMAND`
  - `PASEO_PI_CAPTURE_EXTENSION_COMMAND` → `OMP_PASEO_CAPTURE_EXTENSION_COMMAND`
  - `PASEO_PI_ENTRY_CAPTURE_MARKER` → `OMP_PASEO_ENTRY_CAPTURE_MARKER`
  - `PASEO_PI_COMMAND_RESULT_MARKER` → `OMP_PASEO_COMMAND_RESULT_MARKER`
  - `DEFAULT_PI_EXTENSION_RESULT_TIMEOUT_MS` → `DEFAULT_OMP_EXTENSION_RESULT_TIMEOUT_MS`
  - `PI_HANDLED_BUILTIN_SLASH_COMMANDS` → `OMP_HANDLED_BUILTIN_SLASH_COMMANDS`
  - `PI_CAPABILITIES` → `OMP_CAPABILITIES`
  - `PI_THINKING_OPTIONS` → `OMP_THINKING_OPTIONS`
- Type renames:
  - `PiProviderParamsSchema` → `OmpProviderParamsSchema`
  - `PiProviderParams` → `OmpProviderParams`
  - `PiRpcAgentSession` → `OmpRpcAgentSession`
  - `PiRpcAgentClient` → `OmpRpcAgentClient`
  - `PiPromptPayload` → `OmpPromptPayload`
  - `PiModelReference` → `OmpModelReference`
  - `PiPersistenceMetadata` → `OmpPersistenceMetadata`
  - `PiMcpServerConfig` → `OmpMcpServerConfig`
  - `PiMcpConfigFile` → `OmpMcpConfigFile`
  - `PiTempFile` → `OmpTempFile`
  - `PiCapturedEntry` etc. → `OmpCapturedEntry` etc.
  - `PendingPiUserMessage` → `PendingOmpUserMessage`
  - `PendingExtensionResult` stays (generic)
  - `ActiveAskUserDialog` stays (generic)
  - `PendingCombinedAskUserResponse` stays (generic)
  - `PiSlashCommandInvocation` → `OmpSlashCommandInvocation`
- Function renames: all `pi*` prefixed functions → `omp*` (`normalizePiModelLabel`, `transformPiModels`, `isPiThinkingLevel`, `mapPiModel`, `createRuntime`, `buildResumeConfig`, `toPiMcpConfig`, `createPiPaseoExtensionFile`, `isPiMcpAdapterCommand`, `withPiMcpCapability`, `isPiRequestAbortError`, `latestPiErrorMessage`, `formatPiErrorMessage`, `piAssistantText`)
- Binary command env vars: `PI_COMMAND` → `OMP_COMMAND`, `PI_ACP_PI_COMMAND` → `OMP_ACP_OMP_COMMAND`
- Extension marker names: `PASEO_PI_*` → `PASEO_OMP_*`
- All internal `provider: PI_PROVIDER` literals → `OMP_PROVIDER`
- `commandsRpcType`: pass `"get_available_commands"` to the runtime constructor inside the OMP client

### 2. `packages/server/src/server/agent/providers/omp/rewind.ts`

Copy of `providers/pi/rewind.ts`. Each provider has its own rewind file because it uses a provider-specific navigator API (Pi calls `navigateTree()`). Rename `revertPiConversation` → `revertOmpConversation`. Content is likely identical since both use tree navigation, but they must be independent files — no shared import from pi/.

---

## Shared Modules (do NOT duplicate)

The following files are **already provider-agnostic** and should be imported from `providers/pi/` by both Pi and OMP. Duplicating them creates dead weight and divergence risk:

| File                    | Why shared                                                                                                                                                                                                | Notes                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `history-mapper.ts`     | Takes a dynamic `provider: string` parameter; emits events with whatever provider you give it. No hardcoded `"pi"` strings.                                                                               | Verify no transitive imports pull in Pi-only types.                                           |
| `tool-call-mapper.ts`   | Provider-agnostic internally. Maps tool names/results generically.                                                                                                                                        | —                                                                                             |
| `runtime.ts`            | Defines `PiRuntime` interface + exports. Generic for any Pi-compatible binary. Both providers use the same interface.                                                                                     | No changes needed — both pass their own `command` via existing `PiCliRuntimeOptions.command`. |
| `cli-runtime.ts`        | Implements `PiRuntime` via CLI subprocess. The only differentiation is the command/RPC type, which gets passed at construction time.                                                                      | No changes needed.                                                                            |
| `session-descriptor.ts` | Session descriptor reads JSONL files and parses them. Hardcoded `.pi` constants are only used when `options.sessionDir` is not provided; OMP always passes it explicitly via `providerParams.sessionDir`. | No changes needed — fully parameterized by caller-supplied `sessionDir`.                      |
| `test-utils/fake-pi.ts` | Fake test utilities mock the generic runtime interface. One set serves both providers.                                                                                                                    | —                                                                                             |

OMP's `agent.ts` imports these from `../pi/history-mapper.js`, `../pi/cli-runtime.js`, etc.

---

## Files to Modify

### A. Server-side (`packages/server`)

1. **`provider-registry.ts`**
   - Add import: `import { OmpRpcAgentClient } from "./providers/omp/agent.js";`
   - Replace lines 146–162 (the current `"omp"` factory) with a direct instantiation of `OmpRpcAgentClient`. No more wrapping `PiRpcAgentClient`; no `mergeRuntimeSettings` call; no hardcoded command/sessionDir in the registry — those all live in the OMP client constructor.

   ```ts
   omp: (logger, runtimeSettings, options) =>
     new OmpRpcAgentClient({
       logger,
       runtimeSettings,
       providerParams: options?.providerParams,
     }),
   ```

2. **`provider-launch-config.test.ts`**
   - Verify `builtinProviderIds` array includes both `"pi"` and `"omp"` as separate entries. No derived assumptions to update.

3. **`provider-registry.test.ts`**
   - Remove mock for `"./providers/pi/agent.js"` that was shared between pi and omp tests
   - Add separate mock for `"./providers/omp/agent.js"` if needed
   - Update test expectations: OMP should NOT have `derivedFromProviderId: "pi"` anymore
   - Rename/update test titles: "OMP is a disabled built-in backed by the Pi adapter" → "OMP is a disabled standalone built-in provider"
   - Update the "built-in OMP override passes params to the Pi adapter constructor" test title and expectations

4. **`import-sessions.test.ts`**
   - No changes needed — generic provider handling

5. **E2E test files:**
   - `daemon-e2e/pi.real.e2e.test.ts` — keep as-is (Pi-specific real e2e)
   - `daemon-e2e/pi-rewind.real.e2e.test.ts` — keep as-is
   - Create `daemon-e2e/omp.real.e2e.test.ts` if we want OMP real tests (deferred — out of scope for split)

6. **`real-provider-test-config.ts`**
   - Add `"omp"` to `RealProvider` type union
   - Add binary resolution case for omp alongside pi

7. **`acp-agent.test.ts`**
   - The test using `transformPiModels` with `provider: "pi"` should stay as-is since that's testing the ACP adapter's model transformer with a PI provider specifically
   - No changes needed unless transformPiModels is renamed

8. **`agent-manager.ts`**
   - No changes needed — no `derivedFromProviderId === "pi"` filtering logic exists in production code

9. **`loop-service.ts`, `bootstrap.ts`, `config.ts`, `persisted-config.ts`**
   - Verify no special-casing of "omp" vs "pi" beyond what's already in BUILTIN_PROVIDER_IDS arrays
   - These just list both as built-in IDs, which will remain true

### B. Protocol package (`packages/protocol`)

1. **`src/provider-manifest.ts`**
   - Keep both "pi" and "omp" entries in `AGENT_PROVIDER_DEFINITIONS` — they're now independent providers
   - Update OMP description from `"Pi-compatible coding agent distributed as Oh My Pi"` → `"Oh My Pi — terminal-based coding agent with multi-provider LLM support"` (remove compatibility framing entirely)
   - Both are disabled-by-default built-ins; keep as-is

2. **`src/provider-config.ts`**
   - Already has both `"pi"` and `"omp"` in `BUILTIN_PROVIDER_IDS` — no change needed

3. **`src/provider-icon-names.ts`**
   - Already lists both `"omp"` and `"pi"` — no change needed

### C. App package (`packages/app`)

No changes needed on the app side. The app receives provider strings from the daemon and looks up icons by name. Since we're keeping both `"pi"` and `"omp"` as valid provider strings with separate icon components, the app code is unaffected.

## Files to Delete

None. Pi's implementation stays intact. Its test-utils/fake-pi.ts continues serving both providers via shared imports.

---

## Implementation Order

> **Note:** No shared module changes required — see Shared Modules table above. Existing `PiCliRuntimeOptions.command` (line 52 of cli-runtime.ts) already handles passing a custom default. After splitting, OMP passes `{ command: ["omp"], commandsRpcType: "get_available_commands" }` directly to `new PiCliRuntime(...)`. OMP's `sessionDir` via `providerParams.sessionDir` completely overrides session-descriptor hardcoded constants because it short-circuits all path resolution before any `.pi` constant is consulted.

### Phase 1: Create OMP provider directory and copy files

- Create `providers/omp/` directory
- Copy `providers/pi/agent.ts` → `providers/omp/agent.ts`
- Copy `providers/pi/rewind.ts` → `providers/omp/rewind.ts`

### Phase 2: Rename and adapt OMP agent.ts

- Rename all Pi → OMP identifiers (types, constants, classes, functions)
- Change provider string literals: `PI_PROVIDER` → `OMP_PROVIDER = "omp"`
- Update binary command env vars: `PI_COMMAND` → `OMP_COMMAND`, etc.
- Update extension marker names: `PASEO_PI_*` → `PASEO_OMP_*`
- Import shared modules from `../pi/history-mapper.js`, `../pi/cli-runtime.js`, `../pi/runtime.js`, `../pi/session-descriptor.js`, etc.
- When constructing `PiCliRuntime` via `createRuntime()`: pass `{ command: ["omp"], commandsRpcType: "get_available_commands" }` as options (uses the existing `command` field on `PiCliRuntimeOptions`)
- Session descriptor calls work unchanged — OMP passes its own `sessionDir` via `providerParams.sessionDir` which overrides everything in session-descriptor.ts

### Phase 3: Wire up OMP in provider registry

- Add import for `OmpRpcAgentClient`
- Replace the existing omp factory entry (which wraps `PiRpcAgentClient`) with direct `OmpRpcAgentClient` instantiation
- Remove hardcoded command/sessionDir/RPC type from the registry — they live in the client now

### Phase 4: Update protocol definitions

- Update OMP description in provider-manifest.ts to be self-contained

### Phase 5: Fix tests

- Update provider-registry.test.ts mocks and expectations
- Verify all test suites pass

---

## Verification Checklist

- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Format passes (`npm run format:check`)
- [ ] Server package tests pass (specific files, not full suite)
- [ ] Protocol package tests pass
- [ ] Both "pi" and "omp" providers can be instantiated independently via `buildProviderRegistry`
- [ ] Existing tests no longer depend on shared mock state between pi and omp
- [ ] No COMPAT shim cleanup needed (none exist for this migration; existing `piGetStateFallback` shim is about old OMP binary versions, unrelated)
- [ ] Shared modules verified: `history-mapper.ts`, `tool-call-mapper.ts`, `session-descriptor.ts` have no transitive Pi-only dependencies when imported from `providers/omp/`
