import { useMemo } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";

export interface SidebarAgentNode {
  agentId: string;
  serverId: string;
  title: string | null;
  provider: string; // AgentProvider
  status: string; // AgentLifecycleStatus
  statusBucket: SidebarStateBucket;
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
  childAgents: SidebarAgentNode[];
}

// Build a map of workspaceKey -> root agents with nested children
export function buildAgentTree(
  agents: ReadonlyMap<string, Agent>,
  serverId: string,
): Map<string, SidebarAgentNode[]> {
  const serverAgents = new Map<string, Agent>();
  for (const agent of agents.values()) {
    if (agent.serverId !== serverId || agent.archivedAt) continue;
    serverAgents.set(agent.id, agent);
  }

  // Group by workspace
  const rootsByWorkspace = new Map<string, Agent[]>([] as [string, Agent[]][]);
  for (const agent of serverAgents.values()) {
    const wsId = agent.workspaceId;
    if (!wsId) continue;
    // A root agent has no parent or its parent is in a different workspace
    const parent = agent.parentAgentId ? serverAgents.get(agent.parentAgentId) : undefined;
    if (parent && parent?.workspaceId === wsId) continue; // not a root in this workspace

    const list = rootsByWorkspace.get(wsId);
    if (list) list.push(agent);
    else rootsByWorkspace.set(wsId, [agent]);
  }

  // Build tree recursively
  function buildChildren(parentId: string): SidebarAgentNode[] {
    const children: SidebarAgentNode[] = [];
    for (const agent of serverAgents.values()) {
      if (agent.parentAgentId !== parentId) continue;
      const bucket = deriveSidebarStateBucket({
        status: agent.status,
        pendingPermissionCount: agent.pendingPermissions.length,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
      });
      children.push({
        agentId: agent.id,
        serverId,
        title: agent.title,
        provider: agent.provider,
        status: agent.status,
        statusBucket: bucket,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
        childAgents: buildChildren(agent.id),
      });
    }
    return children;
  }

  const result = new Map<string, SidebarAgentNode[]>();
  for (const [wsId, rootAgents] of rootsByWorkspace) {
    const nodes: SidebarAgentNode[] = [];
    for (const agent of rootAgents) {
      const bucket = deriveSidebarStateBucket({
        status: agent.status,
        pendingPermissionCount: agent.pendingPermissions.length,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
      });
      nodes.push({
        agentId: agent.id,
        serverId,
        title: agent.title,
        provider: agent.provider,
        status: agent.status,
        statusBucket: bucket,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
        childAgents: buildChildren(agent.id),
      });
    }
    // Sort by updatedAt or createdAt descending (newest first)
    nodes.sort((a, b) => a.agentId.localeCompare(b.agentId)); // stable sort placeholder
    result.set(wsId, nodes);
  }
  return result;
}

// Hook that returns agents for given workspace placements
export function useAgentsByWorkspace(
  workspaceKeys: string[],
  enabled: boolean,
): Map<string, SidebarAgentNode[]> {
  // Hooks must be called unconditionally (Rules of Hooks)
  const sessions = useStoreWithEqualityFn(
    useSessionStore,
    (state) => state.sessions,
    Object.is, // reference equality — agents map changes trigger re-render
  );

  return useMemo(() => {
    if (!enabled || workspaceKeys.length === 0) {
      return new Map();
    }

    const result = new Map<string, SidebarAgentNode[]>();
    const seenServerWorkspaces = new Set<string>();

    for (const wk of workspaceKeys) {
      const [serverId, workspaceId] = wk.split(":");
      const session = sessions[serverId];
      if (!session?.agents) continue;
      const key = `${serverId}:${workspaceId}`;
      if (seenServerWorkspaces.has(key)) continue;
      seenServerWorkspaces.add(key);

      const tree = buildAgentTree(session.agents, serverId);
      const nodes = tree.get(workspaceId);
      if (nodes && nodes.length > 0) {
        result.set(wk, nodes);
      }
    }
    return result;
  }, [sessions, workspaceKeys, enabled]);
}
