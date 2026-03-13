import { useMemo, useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";

export interface CommentNavigation {
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Hook that provides navigation props for nodes with comments.
 * Returns null if the node has no comment.
 */
export function useCommentNavigation(nodeId: string): CommentNavigation | null {
  const nodes = useWorkflowStore((state) => state.nodes);
  const getNodesWithComments = useWorkflowStore((state) => state.getNodesWithComments);
  const markCommentViewed = useWorkflowStore((state) => state.markCommentViewed);
  const setNavigationTarget = useWorkflowStore((state) => state.setNavigationTarget);

  // Get the current node's comment
  const nodeComment = useMemo(() => {
    const node = nodes.find((n) => n.id === nodeId);
    const data = node?.data as { comment?: string } | undefined;
    return data?.comment?.trim() || null;
  }, [nodes, nodeId]);

  // Get sorted nodes with comments
  const nodesWithComments = useMemo(() => {
    return getNodesWithComments();
  }, [getNodesWithComments]);

  // Find current index in the sorted list
  const currentIndex = useMemo(() => {
    return nodesWithComments.findIndex((n) => n.id === nodeId);
  }, [nodesWithComments, nodeId]);

  const navigateTo = useCallback(
    (targetIndex: number) => {
      const targetNode = nodesWithComments[targetIndex];
      if (targetNode) {
        markCommentViewed(targetNode.id);
        setNavigationTarget(targetNode.id);
      }
    },
    [nodesWithComments, markCommentViewed, setNavigationTarget]
  );

  const onPrevious = useCallback(() => {
    if (nodesWithComments.length === 0) return;
    // Wrap from first to last
    const newIndex = currentIndex <= 0 ? nodesWithComments.length - 1 : currentIndex - 1;
    navigateTo(newIndex);
  }, [currentIndex, nodesWithComments.length, navigateTo]);

  const onNext = useCallback(() => {
    if (nodesWithComments.length === 0) return;
    // Wrap from last to first
    const newIndex = (currentIndex + 1) % nodesWithComments.length;
    navigateTo(newIndex);
  }, [currentIndex, nodesWithComments.length, navigateTo]);

  // Return null if node has no comment
  if (!nodeComment || currentIndex === -1) {
    return null;
  }

  return {
    currentIndex: currentIndex + 1, // 1-based for display
    totalCount: nodesWithComments.length,
    onPrevious,
    onNext,
  };
}
