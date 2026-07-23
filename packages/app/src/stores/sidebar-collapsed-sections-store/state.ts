export interface CollapsedProjectsState {
  collapsedProjectKeys: Set<string>;
  collapsedStatusGroupKeys: Set<string>;
  collapsedPinned: boolean;
  // Sidebar tree expansion: workspaces and agents that have child nodes
  collapsedWorkspaceKeys: Set<string>;
  collapsedAgentIds: Set<string>;
}

export interface PersistedCollapsedProjects {
  collapsedProjectKeys?: unknown;
  collapsedStatusGroupKeys?: unknown;
  collapsedPinned?: unknown;
  collapsedWorkspaceKeys?: unknown;
  collapsedAgentIds?: unknown;
}

export function togglePinnedCollapsed(state: CollapsedProjectsState): CollapsedProjectsState {
  return { ...state, collapsedPinned: !state.collapsedPinned };
}

export function toggleProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (next.has(projectKey)) {
    next.delete(projectKey);
  } else {
    next.add(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function toggleWorkspaceCollapsed(
  state: CollapsedProjectsState,
  workspaceKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceKeys);
  if (next.has(workspaceKey)) {
    next.delete(workspaceKey);
  } else {
    next.add(workspaceKey);
  }
  return { ...state, collapsedWorkspaceKeys: next };
}

export function setWorkspaceCollapsed(
  state: CollapsedProjectsState,
  workspaceKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceKeys);
  if (collapsed) {
    next.add(workspaceKey);
  } else {
    next.delete(workspaceKey);
  }
  return { ...state, collapsedWorkspaceKeys: next };
}

export function toggleAgentCollapsed(
  state: CollapsedProjectsState,
  agentId: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedAgentIds);
  if (next.has(agentId)) {
    next.delete(agentId);
  } else {
    next.add(agentId);
  }
  return { ...state, collapsedAgentIds: next };
}

export function toggleStatusGroupCollapsed(
  state: CollapsedProjectsState,
  statusGroupKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedStatusGroupKeys);
  if (next.has(statusGroupKey)) {
    next.delete(statusGroupKey);
  } else {
    next.add(statusGroupKey);
  }
  return { ...state, collapsedStatusGroupKeys: next };
}

export function setProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (collapsed) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function serializeCollapsedProjects(state: CollapsedProjectsState): {
  collapsedProjectKeys: string[];
  collapsedStatusGroupKeys: string[];
  collapsedPinned: boolean;
  collapsedWorkspaceKeys: string[];
  collapsedAgentIds: string[];
} {
  return {
    collapsedProjectKeys: Array.from(state.collapsedProjectKeys),
    collapsedStatusGroupKeys: Array.from(state.collapsedStatusGroupKeys),
    collapsedPinned: state.collapsedPinned,
    collapsedWorkspaceKeys: Array.from(state.collapsedWorkspaceKeys),
    collapsedAgentIds: Array.from(state.collapsedAgentIds),
  };
}

/**
 * Safely deserializes a persisted value into a Set<string>.
 * Handles arrays from JSON storage or any unexpected type.
 */
function deserializeCollapsedKeys(value: unknown): Set<string> {
  if (Array.isArray(value)) {
    return new Set(value.filter((v): v is string => typeof v === "string"));
  }
  return new Set();
}

export function mergePersistedCollapsedProjects<S extends CollapsedProjectsState>(
  persisted: PersistedCollapsedProjects | undefined,
  current: S,
): S {
  if (
    !persisted?.collapsedProjectKeys &&
    !persisted?.collapsedStatusGroupKeys &&
    persisted?.collapsedPinned === undefined &&
    !persisted?.collapsedWorkspaceKeys &&
    !persisted?.collapsedAgentIds
  ) {
    return current;
  }
  const restoredProjects = deserializeCollapsedKeys(persisted.collapsedProjectKeys);
  const restoredStatusGroups = deserializeCollapsedKeys(persisted.collapsedStatusGroupKeys);
  const restoredPinned =
    typeof persisted.collapsedPinned === "boolean"
      ? persisted.collapsedPinned
      : current.collapsedPinned;
  const restoredWorkspaces = deserializeCollapsedKeys(persisted.collapsedWorkspaceKeys);
  const restoredAgents = deserializeCollapsedKeys(persisted.collapsedAgentIds);
  if (
    areSetsEqual(current.collapsedProjectKeys, restoredProjects) &&
    areSetsEqual(current.collapsedStatusGroupKeys, restoredStatusGroups) &&
    current.collapsedPinned === restoredPinned &&
    areSetsEqual(current.collapsedWorkspaceKeys, restoredWorkspaces) &&
    areSetsEqual(current.collapsedAgentIds, restoredAgents)
  ) {
    return current;
  }
  return {
    ...current,
    collapsedProjectKeys: restoredProjects,
    collapsedStatusGroupKeys: restoredStatusGroups,
    collapsedPinned: restoredPinned,
    collapsedWorkspaceKeys: restoredWorkspaces,
    collapsedAgentIds: restoredAgents,
  };
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}
