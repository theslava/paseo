import { View, Pressable, Text } from "react-native";
import { memo, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { SidebarAgentNode } from "@/hooks/sidebar-agent-tree";
import { AgentStatusDot } from "@/components/agent-status-dot";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);

interface SidebarAgentRowProps {
  node: SidebarAgentNode;
  depth: number;
  isCollapsed: boolean;
  onPress: (agentId: string) => void;
  onToggleCollapse?: (agentId: string) => void;
}

export function SidebarAgentRow({
  node,
  depth,
  isCollapsed,
  onPress,
  onToggleCollapse,
}: SidebarAgentRowProps) {
  const hasChildren = node.childAgents.length > 0;

  const handlePress = useCallback(() => {
    onPress(node.agentId);
  }, [onPress, node.agentId]);

  const handleLeadingPress = useCallback(
    (_e: unknown) => {
      if (hasChildren && onToggleCollapse) {
        onToggleCollapse(node.agentId);
      }
    },
    [hasChildren, onToggleCollapse, node.agentId],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.leadingSpacer, { paddingLeft: 8 + depth * 16 }]}>
        {hasChildren ? (
          <Pressable onPress={handleLeadingPress} hitSlop={4}>
            {isCollapsed ? <ThemedChevronRight size={12} /> : <ThemedChevronDown size={12} />}
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={styles.row}
        onPress={handlePress}
        testID={`sidebar-agent-row-${node.agentId}`}
      >
        <AgentStatusDot
          status={node.status}
          requiresAttention={node.requiresAttention}
          attentionReason={node.attentionReason ?? null}
        />
        <Text numberOfLines={1} style={styles.title}>
          {node.title || `${node.provider} agent`}
        </Text>
      </Pressable>
    </View>
  );
}

export const MemoSidebarAgentRow = memo(SidebarAgentRow);

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  leadingSpacer: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
    height: 32,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    lineHeight: 18,
    flexShrink: 1,
  },
}));
