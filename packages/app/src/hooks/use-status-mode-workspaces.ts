import { useMemo } from "react";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildSidebarStatusWorkspacePlacements,
  type SidebarStatusWorkspacePlacement,
  type SidebarWorkspacePlacement,
} from "./use-sidebar-workspaces-list";

const EMPTY_WORKSPACES: SidebarStatusWorkspacePlacement[] = [];
const EMPTY_SESSIONS: ReturnType<typeof useSessionStore.getState>["sessions"] = {};
const EMPTY_PENDING_CREATE_ATTEMPTS: ReturnType<
  typeof useCreateFlowStore.getState
>["pendingByDraftId"] = {};

export function useStatusModeWorkspacePlacements(input: {
  placements: SidebarWorkspacePlacement[];
  enabled?: boolean;
}): SidebarStatusWorkspacePlacement[] {
  const isEnabled = input.enabled !== false && input.placements.length > 0;
  const sessions = useSessionStore((state) => (isEnabled ? state.sessions : EMPTY_SESSIONS));
  const pendingCreateAttempts = useCreateFlowStore((state) =>
    isEnabled ? state.pendingByDraftId : EMPTY_PENDING_CREATE_ATTEMPTS,
  );

  return useMemo(() => {
    if (!isEnabled) {
      return EMPTY_WORKSPACES;
    }

    const serverIds = new Set(input.placements.map((placement) => placement.serverId));
    const statusSessions = Array.from(serverIds).flatMap((serverId) => {
      const session = sessions[serverId];
      return session ? [{ serverId, workspaces: session.workspaces, agents: session.agents }] : [];
    });

    return buildSidebarStatusWorkspacePlacements({
      placements: input.placements,
      sessions: statusSessions,
      pendingCreateAttempts,
    });
  }, [input.placements, isEnabled, pendingCreateAttempts, sessions]);
}
