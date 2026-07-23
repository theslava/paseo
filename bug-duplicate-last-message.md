# Bug: Last Model Message Duplicated When Switching from Desktop to Android

## Symptom

Start an agent session on desktop (Windows/Electron), then open the same session on Android. The last message from the model appears twice in the chat view.

## Reproduction Steps

1. Start an AI agent session on desktop, let it produce output (including completing a turn).
2. While the agent is running (or shortly after a turn completes), open the same workspace/agent on Android.
3. Observe the last assistant message appearing twice at the bottom of the conversation.

---

## Root Cause Analysis

### System Overview

Timeline delivery has two paths:

| Path                      | Mechanism                                          | Purpose                                   | Dedup Strategy                                                     |
| ------------------------- | -------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| **Live stream**           | `agent_stream` WebSocket messages pushed by server | Immediacy — real-time streaming           | Sequence-number gate (`seq <= cursor.endSeq` → drop)               |
| **Authoritative history** | `fetch_agent_timeline_request` RPC responses       | Correctness — canonical projected entries | Replace path for initial load; overlap reconciliation for catch-up |

When a new client connects while an agent is actively producing events, both paths deliver content for the same timeline range simultaneously.

### The Race Window

```
T0  Mobile connects, requests tail page → server returns entries through seq N
T1  Tail applied via REPLACE path, cursor = { endSeq: N }
T2  Agent produces seq N+1 (e.g. final assistant_message chunk or turn_completed)
T3  Server broadcasts agent_stream(seq=N+1) to ALL sessions, including new mobile session
T4  Mobile's live handler accepts seq N+1 (seq == cursor.endSeq + 1 ✓)
      → Item appended to head/tail; cursor advances to endSeq = N+1
T5  Meanwhile, viewed-timeline-sync runs catch-up (initial response had hasNewer=true)
T6  Catch-up fetch returns a projected entry covering seq N+1 (and possibly more)
T7  applyAcceptedForwardTimelineUnits() processes the catch-up page
```

At T7, two reconciliation mechanisms should prevent duplication — but both have gaps.

---

## Gap 1: `replaceLiveAssistantWithProjectedText()` Only Checks Head

**File:** `packages/app/src/timeline/session-stream-reducers.ts`, lines 520–546

This function is called from `applyCanonicalForwardUnit()` when a canonical forward unit arrives and there are items in head. It searches for a matching assistant message **in head only**:

```ts
const index = head.findLastIndex((item) => item.kind === "assistant_message");
```

If the live stream already flushed an assistant message from head → tail (via `turn_completed` or any other flush trigger), the item no longer lives in head. The function returns `null`, falls through to `applyStreamEvent()`, which appends the item as new content — producing a duplicate.

### Flush triggers that move items from head → tail before catch-up arrives:

- `turn_completed`, `turn_failed`, `turn_canceled` — explicit completion events (`STREAM_COMPLETION_EVENTS`)
- Any event whose kind requires flushing the previous head (e.g., tool call after assistant message)

---

## Gap 2: Overlap Reconciliation Requires Straddle, Not Containment

**File:** `packages/app/src/timeline/session-stream-reducers.ts`, lines 615–617

`reconcileOverlappingProjectedAssistant()` only reconciles items whose `sourceSeqRanges` **straddle** `currentEndSeq`:

```ts
unit.sourceSeqRanges.some(
  (range) => range.startSeq <= params.currentEndSeq && range.endSeq > params.currentEndSeq,
);
```

A fully-complete projected item whose ranges end at or before `currentEndSeq` won't be reconciled. Meanwhile, `acceptIncrementalTimelineUnits()` can still accept it if the overall page's `responseEndSeq > currentCursor.endSeq`. The unit passes acceptance but skips reconciliation, falling through to append.

This is especially likely when projection merges multiple source rows into one projected item with a higher `seqEnd` than any individual live row.

---

## Gap 3: Sequence Gate Accepts Live Events That Catch-up Also Returns

**File:** `packages/app/src/timeline/session-stream-reducers.ts`, line 431

`acceptIncrementalTimelineUnits()` drops pages where `responseEndSeq <= currentCursor.endSeq`. But if a live event advanced the cursor (T4 above), and the catch-up page covers both already-consumed seqs AND new ones beyond, the page is accepted in full — including entries for seqs that were already applied via live stream.

The per-unit overlap reconciliation should handle this, but as noted in Gaps 1 and 2, it doesn't cover all cases.

---

## Affected Code Paths

| Component                     | File                         | Lines     | Role                                                                            |
| ----------------------------- | ---------------------------- | --------- | ------------------------------------------------------------------------------- |
| Live stream dedup gate        | `session-stream-reducers.ts` | 1226–1294 | `processTimelineSequencingGate` / `classifySessionTimelineSeq`                  |
| Incremental accept (catch-up) | `session-stream-reducers.ts` | 392–448   | `acceptIncrementalTimelineUnits`                                                |
| Overlap reconciliation entry  | `session-stream-reducers.ts` | 733–766   | `reconcileOverlappingProjectedStreamItems`                                      |
| Straddle check (Gap 2)        | `session-stream-reducers.ts` | 604–619   | `reconcileOverlappingProjectedAssistant` guard                                  |
| Head-only replacement (Gap 1) | `session-stream-reducers.ts` | 520–546   | `replaceLiveAssistantWithProjectedText`                                         |
| Canonical forward append      | `session-stream-reducers.ts` | 805–839   | `applyCanonicalForwardUnit` — falls through to append when reconciliation fails |
| Forward timeline units loop   | `session-stream-reducers.ts` | 841–918   | `applyAcceptedForwardTimelineUnits`                                             |
| Timeline response handler     | `session-context.tsx`        | 833–836   | Flushes live queue, then applies timeline response synchronously                |
| Catch-up orchestrator         | `viewed-timeline-sync.ts`    | 143–220   | `fetchUntilCurrent`, `startCatchUp`                                             |

## Relevant Documentation

- `docs/timeline-sync.md` — Two-path delivery model, catch-up pagination, projected page reconciliation contract. Key passage: _"It must not append full projected text to a live prefix."_ This is the violated invariant.

---

## Fix Directions (not part of this bug report)

1. **Extend `replaceLiveAssistantWithProjectedText()`** to also check tail for a matching assistant message when head has none, or restructure so that canonical forward units reconcile against both head and tail.

2. **Relax the straddle requirement in overlap reconciliation** to handle containment cases where projected item ranges are fully within `[cursor.startSeq, currentEndSeq]`. A projected item whose content matches an existing tail item should be replaced, not appended.

3. **Filter accepted incremental units by per-seq dedup** after `acceptIncrementalTimelineUnits()` passes them through — skip individual units whose `seqStart <= currentCursor.endSeq` before entering the apply loop, rather than relying on downstream reconciliation to catch them.
