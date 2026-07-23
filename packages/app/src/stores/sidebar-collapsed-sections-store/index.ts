import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setProjectCollapsed,
  setWorkspaceCollapsed,
  toggleAgentCollapsed,
  togglePinnedCollapsed,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
  toggleWorkspaceCollapsed,
} from "./state";

interface SidebarCollapsedSectionsState extends CollapsedProjectsState {
  toggleProjectCollapsed: (projectKey: string) => void;
  setProjectCollapsed: (projectKey: string, collapsed: boolean) => void;
  toggleStatusGroupCollapsed: (statusGroupKey: string) => void;
  togglePinnedCollapsed: () => void;
  toggleWorkspaceCollapsed: (workspaceKey: string) => void;
  setWorkspaceCollapsed: (workspaceKey: string, collapsed: boolean) => void;
  toggleAgentCollapsed: (agentId: string) => void;
}

export const useSidebarCollapsedSectionsStore = create<SidebarCollapsedSectionsState>()(
  persist(
    (set) => ({
      collapsedProjectKeys: new Set(),
      collapsedStatusGroupKeys: new Set(),
      collapsedPinned: false,
      collapsedWorkspaceKeys: new Set(),
      collapsedAgentIds: new Set(),
      toggleProjectCollapsed: (projectKey) =>
        set((state) => toggleProjectCollapsed(state, projectKey)),
      setProjectCollapsed: (projectKey, collapsed) =>
        set((state) => setProjectCollapsed(state, projectKey, collapsed)),
      toggleStatusGroupCollapsed: (statusGroupKey) =>
        set((state) => toggleStatusGroupCollapsed(state, statusGroupKey)),
      togglePinnedCollapsed: () => set((state) => togglePinnedCollapsed(state)),
      toggleWorkspaceCollapsed: (workspaceKey) =>
        set((state) => toggleWorkspaceCollapsed(state, workspaceKey)),
      setWorkspaceCollapsed: (workspaceKey, collapsed) =>
        set((state) => setWorkspaceCollapsed(state, workspaceKey, collapsed)),
      toggleAgentCollapsed: (agentId) => set((state) => toggleAgentCollapsed(state, agentId)),
    }),
    {
      name: "sidebar-collapsed-sections",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeCollapsedProjects(state),
      merge: (persistedState, currentState) =>
        mergePersistedCollapsedProjects(
          persistedState as { collapsedProjectKeys?: unknown } | undefined,
          currentState,
        ),
    },
  ),
);
