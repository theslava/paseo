# Plan: Split OMP from Pi — Independent Provider

## Goal

Make Oh My Pi (OMP) its own standalone provider, fully decoupled from Pi. Currently OMP is a derived provider that reuses the Pi adapter with only the binary name (`"omp"` vs `"pi"`) and session directory default differing. After this change both providers exist independently with their own implementation files.

## Branch

Create and work on branch `feat/split-omp-from-pi`.

---

## Current State Summary

| Aspect                 | Before                                                                | After                                                  |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `provider-registry.ts` | "omp" factory wraps `PiRpcAgentClient` with overridden command/params | New "omp" factory creates `OmpRpcAgentClient` directly |
| Provider definition    | Built-in in `AGENT_PROVIDER_DEFINITIONS`, disabled by default         | Independent built-in, disabled by default              |
| Implementation         | Single `providers/pi/` directory shared by both                       | `providers/pi/` for Pi, `providers/omp/` for OMP       |
| Provider string        | Both emit `"pi"` internally                                           | Pi emits `"pi"`, OMP emits `"omp"`                     |
| Derived relationship   | None currently used (derivedFromProviderId is null)                   | N/A — no longer derived                                |

## Files to Create (copy from pi → omp)

1. **`packages/server/src/server/agent/providers/omp/agent.ts`** — copy of `providers/pi/agent.ts`
   - Rename: `PI_` constants → `OMP_`
   - Rename: `PiProviderParamsSchema` → `OmpProviderParamsSchema`
   - Rename: `PiProviderParams` → `OmpProviderParams`
   - Rename: `PiRpcAgentSession` → `OmpRpcAgentSession`
   - Rename: `PiRpcAgentClient` → `OmpRpcAgentClient`
   - Change `PI_PROVIDER = "pi"` → `OMP_PROVIDER = "omp"`
   - Change binary command env vars: `process.env.OMP_COMMAND ?? process.env.OMP_ACP_OMP_COMMAND ?? "omp"`
   - Update extension marker names: `PASEO_PI_*` → `PASEO_OMP_*`
   - All internal `provider: "pi"` literals in event/session code → `"omp"`
   - Keep shared types (`PiRuntime`, `PiCliRuntime`) as-is since runtime interface is provider-agnostic; but rename the class references to use OMP-specific naming where it matters for the client layer

2. **`packages/server/src/server/agent/providers/omp/rpc-types.ts`** — direct copy of pi version (types are generic)

3. **`packages/server/src/server/agent/providers/omp/cli-runtime.ts`** — copy from pi
   - Rename: `DEFAULT_PI_COMMAND` → `DEFAULT_OMP_COMMAND`
   - Update env var refs: `PI_COMMAND` → `OMP_COMMAND`
   - Update comments referencing Pi/Omp accordingly

4. **`packages/server/src/server/agent/providers/omp/history-mapper.ts`** — copy from pi, change all `provider: "pi"` → `provider: "omp"` in emitted events

5. **`packages/server/src/server/agent/providers/omp/tool-call-mapper.ts`** — copy from pi (tool call mapping is provider-agnostic internally, check if any hardcoded strings need updating)

6. **`packages/server/src/server/agent/providers/omp/runtime.ts`** — direct copy (runtime interface is shared)

7. **`packages/server/src/server/agent/providers/omp/rewind.ts`** — copy from pi

8. **`packages/server/src/server/agent/providers/omp/session-descriptor.ts`** — copy from pi

9. **`packages/server/src/server/agent/providers/omp/test-utils/fake-omp.ts`** — copy of `fake-pi.ts`, update binary default to `"omp"`

## Files to Modify

### A. Server-side (`packages/server`)

1. **`provider-registry.ts`**
   - Add new import: `import { OmpRpcAgentClient } from "./providers/omp/agent.js";`
   - Replace the existing `"omp"` factory entry that wraps `PiRpcAgentClient` with a new one creating `OmpRpcAgentClient` directly
   - Remove the runtimeSettings override merge for omp — it's now its own class

2. **`provider-launch-config.test.ts`**
   - Update `builtinProviderIds` array to include both `"pi"` and `"omp"` as separate entries (already there, just verify no derived assumptions)

3. **`provider-registry.test.ts`**
   - Remove mock for `"./providers/pi/agent.js"` that was shared between pi and omp tests
   - Add separate mock for `"./providers/omp/agent.js"` if needed
   - Update test expectations: OMP should NOT have `derivedFromProviderId: "pi"` anymore
   - Rename/update test titles: "OMP is a disabled built-in backed by the Pi adapter" → "OMP is a disabled standalone built-in provider"
   - Update the "built-in OMP override passes params to the Pi adapter constructor" test title and expectations

4. **`agent-manager.test.ts`**
   - Update the `listImportableSessions includes derived providers` test — OMP is no longer derived from Pi
   - Change `derivedFromProviderId: "pi"` → `derivedFromProviderId: null` in test setup
   - If Pi session import logic had any special-casing for derived providers, remove it

5. **`import-sessions.test.ts`**
   - No changes needed — generic provider handling

6. **E2E test files:**
   - `daemon-e2e/pi.real.e2e.test.ts` — keep as-is (Pi-specific real e2e)
   - `daemon-e2e/pi-rewind.real.e2e.test.ts` — keep as-is

- Create `daemon-e2e/omp.real.e2e.test.ts` if we want OMP real tests (deferred — out of scope for split)

7. **`real-provider-test-config.ts`**
   - Add `"omp"` to `RealProvider` type union
   - Add binary resolution case for omp alongside pi

8. **`acp-agent.test.ts`**
   - The test using `transformPiModels` with `provider: "pi"` should stay as-is since that's testing the ACP adapter's model transformer with a PI provider specifically
   - No changes needed unless transformPiModels is renamed

9. **`agent-manager.ts`**
   - Remove any `derivedFromProviderId === "pi"` filtering logic in `listAgents` / `listImportableSessions` if it exists
   - Check for COMPAT shims referencing derived-from-pi behavior

10. **`loop-service.ts`**, **`bootstrap.ts`**, **`config.ts`**, **`persisted-config.ts`**
    - Verify no special-casing of "omp" vs "pi" beyond what's already in BUILTIN_PROVIDER_IDS arrays
    - These just list both as built-in IDs, which will remain true

### B. Protocol package (`packages/protocol`)

1. **`src/provider-manifest.ts`**
   - Keep both "pi" and "omp" entries in `AGENT_PROVIDER_DEFINITIONS` — they're now independent providers
   - Update OMP description to be self-contained (remove "Pi-compatible")
   - Both are disabled-by-default built-ins; keep as-is

2. **`src/provider-config.ts`**
   - Already has both `"pi"` and `"omp"` in `BUILTIN_PROVIDER_IDS` — no change needed

3. **`src/provider-icon-names.ts`**
   - Already lists both `"omp"` and `"pi"` — no change needed

### C. App package (`packages/app`)

No changes needed on the app side. The app receives provider strings from the daemon and looks up icons by name. Since we're keeping both `"pi"` and `"omp"` as valid provider strings with separate icon components, the app code is unaffected.

## Files to Delete

1. **`packages/server/src/server/agent/providers/pi/test-utils/fake-pi.ts`** — keep as-is for Pi tests only

No files need deletion at this stage. Pi's implementation stays intact.

---

## Implementation Order

### Phase 1: Create OMP provider directory and copy files

- Create `providers/omp/` directory
- Copy all source files from `providers/pi/` into it
- Rename test files where applicable

### Phase 2: Rename and adapt OMP files

- In each copied file: rename types, constants, classes from Pi → OMP
- Change provider string literals from `"pi"` → `"omp"`
- Update binary command env vars from `PI_COMMAND` → `OMP_COMMAND`
- Update extension marker names from `PASEO_PI_*` → `PASEO_OMP_*`

### Phase 3: Wire up OMP in provider registry

- Add import for `OmpRpcAgentClient`
- Replace the existing omp factory entry (which wraps PiRpcAgentClient) with direct OmpRpcAgentClient instantiation
- Remove COMPAT shims that reference derived-from-pi behavior

### Phase 4: Update protocol definitions

- Update OMP description in provider-manifest.ts to be self-contained

### Phase 5: Fix tests

- Update provider-registry.test.ts mocks and expectations
- Update agent-manager.test.ts derived-provider test
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
- [ ] No remaining references to `derivedFromProviderId === "pi"` for omp
