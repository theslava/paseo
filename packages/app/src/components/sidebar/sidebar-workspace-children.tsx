import { View, Pressable, Text } from "react-native";
import { memo, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { SidebarAgentNode } from "@/hooks/sidebar-agent-tree";
import type { SidebarTerminalEntry } from "@/hooks/use-sidebar-terminals";
import { MemoSidebarAgentRow } from "./sidebar-agent-row";
import { useSessionStore } from "@/stores/session-store";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedTerminal = withUnistyles(Terminal);

/**
 * Renders a single agent node and its recursive children.
 */
function AgentTreeNode({
  node,
  depth,
  collapsedAgentIds,
  toggleAgentCollapsed,
}: {
  node: SidebarAgentNode;
  depth: number;
  collapsedAgentIds: ReadonlySet<string>;
  toggleAgentCollapsed: (agentId: string) => void;
}) {
  const handlePress = useCallback(
    (agentId: string) => {
      useSessionStore.getState().setFocusedAgentId(node.serverId, agentId);
    },
    [node.serverId],
  );

  return (
    <View>
      <MemoSidebarAgentRow
        key={node.agentId}
        node={node}
        depth={depth}
        isCollapsed={collapsedAgentIds.has(node.agentId)}
        onPress={handlePress}
        onToggleCollapse={toggleAgentCollapsed}
      />
      {!collapsedAgentIds.has(node.agentId) &&
        node.childAgents.map((child) => (
          <AgentTreeNode
            key={child.agentId}
            node={child}
            depth={depth + 1}
            collapsedAgentIds={collapsedAgentIds}
            toggleAgentCollapsed={toggleAgentCollapsed}
          />
        ))}
    </View>
  );
}

/**
 * Renders terminals as simple rows at workspace level.
 */
function TerminalRow({ entry, serverId }: { entry: SidebarTerminalEntry; serverId: string }) {
  const handlePress = useCallback(() => {
    useSessionStore.getState().setFocusedTerminalId(serverId, entry.id);
  }, [serverId, entry.id]);

  return (
    <Pressable onPress={handlePress} testID={`sidebar-terminal-row-${entry.id}`}>
      {() => (
        <View style={styles.terminalRow}>
          <ThemedTerminal size={12} />
          <Text numberOfLines={1} style={styles.terminalTitle}>
            {entry.title || entry.name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function TerminalList({
  terminals,
  serverId,
}: {
  terminals: SidebarTerminalEntry[];
  serverId: string;
}) {
  return (
    <View style={styles.terminalSection}>
      {terminals.map((t) => (
        <TerminalRow key={t.id} entry={t} serverId={serverId} />
      ))}
    </View>
  );
}

interface SidebarWorkspaceChildrenProps {
  workspaceKey: string;
  agents: SidebarAgentNode[] | null;
  terminals: SidebarTerminalEntry[] | null;
  collapsedWorkspaceKeys: ReadonlySet<string>;
  toggleWorkspaceCollapsed: (workspaceKey: string) => void;
  collapsedAgentIds: ReadonlySet<string>;
  toggleAgentCollapsed: (agentId: string) => void;
}

function AgentHeader({
  count,
  isCollapsed,
  onToggle,
}: {
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} hitSlop={4} style={styles.sectionHeader}>
      {isCollapsed ? <ThemedChevronRight size={10} /> : <ThemedChevronDown size={10} />}
      <Text style={styles.sectionLabel}>
        {count} agent{count !== 1 ? "s" : ""}
      </Text>
    </Pressable>
  );
}

export function SidebarWorkspaceChildren({
  workspaceKey,
  agents,
  terminals,
  collapsedWorkspaceKeys,
  toggleWorkspaceCollapsed,
  collapsedAgentIds,
  toggleAgentCollapsed,
}: SidebarWorkspaceChildrenProps) {
  // Extract serverId from workspaceKey ("${serverId}:${workspaceId}")
  const serverId = useMemo(() => workspaceKey.split(":")[0], [workspaceKey]);

  const handleToggleWorkspace = useCallback(
    () => toggleWorkspaceCollapsed(workspaceKey),
    [toggleWorkspaceCollapsed, workspaceKey],
  );

  const hasContent = (agents && agents.length > 0) || (terminals && terminals.length > 0);
  if (!hasContent) return null;

  const isCollapsed = collapsedWorkspaceKeys.has(workspaceKey);
  const showExpanded = !isCollapsed;
  return (
    <View style={styles.container}>
      {/* Agents section */}
      {agents && agents.length > 0 && (
        <View style={styles.agentSection}>
          <AgentHeader
            count={agents.length}
            isCollapsed={isCollapsed}
            onToggle={handleToggleWorkspace}
          />
          {showExpanded &&
            agents.map((node) => (
              <AgentTreeNode
                key={node.agentId}
                node={node}
                depth={0}
                collapsedAgentIds={collapsedAgentIds}
                toggleAgentCollapsed={toggleAgentCollapsed}
              />
            ))}
        </View>
      )}

      {/* Terminals section */}
      {terminals && terminals.length > 0 && showExpanded && (
        <TerminalList terminals={terminals} serverId={serverId} />
      )}
    </View>
  );
}

export const MemoSidebarWorkspaceChildren = memo(SidebarWorkspaceChildren);

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    paddingLeft: 16,
  },
  agentSection: {
    paddingTop: 2,
  },
  terminalSection: {
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontStyle: "italic",
  },
  terminalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  terminalTitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    lineHeight: 18,
    flexShrink: 1,
  },
}));
