import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";

interface SidebarViewStoreState {
  groupMode: SidebarGroupMode;
  hostFilter: string | null;
  setGroupMode: (mode: SidebarGroupMode) => void;
  setHostFilter: (serverId: string | null) => void;
  reconcileHostFilter: (serverIds: readonly string[]) => void;
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set) => ({
      groupMode: "project",
      hostFilter: null,
      setGroupMode: (mode) => set({ groupMode: mode }),
      setHostFilter: (serverId) => set({ hostFilter: serverId }),
      reconcileHostFilter: (serverIds) =>
        set((state) => {
          if (!state.hostFilter || serverIds.includes(state.hostFilter)) {
            return state;
          }
          return { hostFilter: null };
        }),
    }),
    {
      name: "sidebar-view",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        groupMode: state.groupMode,
        hostFilter: state.hostFilter,
      }),
    },
  ),
);
