import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ListTerminalsResponse } from "@getpaseo/protocol/messages";
import { buildTerminalsQueryKey } from "@/screens/workspace/terminals/state";
import type { SidebarWorkspacePlacement } from "@/hooks/sidebar-workspaces-view-model";

export interface SidebarTerminalEntry {
  id: string;
  name: string;
  title: string | null;
}

/**
 * Read terminal lists from the existing React Query cache for visible workspaces.
 * Does NOT trigger fetches — only returns data that has already been loaded (e.g.
 * when a workspace screen was previously visited). Terminals appear in the sidebar
 * once their workspace's terminal list is cached.
 */
export function useSidebarTerminals(
  placements: readonly SidebarWorkspacePlacement[],
): Map<string, SidebarTerminalEntry[]> {
  const queryClient = useQueryClient();

  return useMemo(() => {
    if (placements.length === 0) return new Map();

    const result = new Map<string, SidebarTerminalEntry[]>();

    for (const placement of placements) {
      const key = buildTerminalsQueryKey(
        placement.serverId,
        placement.workspaceDirectory ?? "",
        placement.workspaceId,
      );
      const cached = queryClient.getQueryData<ListTerminalsResponse["payload"]>(key);
      if (!cached?.terminals || cached.terminals.length === 0) continue;

      // Filter to terminals belonging to this workspace
      const entries: SidebarTerminalEntry[] = cached.terminals
        .filter((t) => t.workspaceId === placement.workspaceId)
        .map((t) => ({ id: t.id, name: t.name, title: t.title ?? null }));

      if (entries.length > 0) {
        result.set(placement.workspaceKey, entries);
      }
    }
    return result;
  }, [queryClient, placements]);
}
