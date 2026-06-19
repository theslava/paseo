import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarViewStore } from "./sidebar-view-store";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("sidebar view store", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupMode: "project",
      hostFilter: null,
    });
  });

  it("keeps a host filter that still points at an available host", () => {
    useSidebarViewStore.getState().setHostFilter("host-a");

    useSidebarViewStore.getState().reconcileHostFilter(["host-a", "host-b"]);

    expect(useSidebarViewStore.getState().hostFilter).toBe("host-a");
  });

  it("clears a host filter after that host is removed", () => {
    useSidebarViewStore.getState().setHostFilter("removed-host");

    useSidebarViewStore.getState().reconcileHostFilter(["host-a"]);

    expect(useSidebarViewStore.getState().hostFilter).toBeNull();
  });
});
