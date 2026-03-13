"use client";

import { type FormEventHandler, useState } from "react";
import { NodeProps, Node } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import type { CommentNodeData } from "@/types";

type CommentNodeType = Node<CommentNodeData, "comment">;

function getTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "now";
  if (diffInSeconds < 120) return "1 min ago";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 7200) return "1 hr ago";
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hr ago`;
  if (diffInSeconds < 172800) return "1 day ago";
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
}

function getInitials(author: string) {
  return author.slice(0, 2).toUpperCase();
}

const DEFAULT_AUTHOR = "User";

export function CommentNode({ data, id, selected = false }: NodeProps<CommentNodeType>) {
  const [inputValue, setInputValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(false);
  const nodes = useWorkflowStore((state) => state.nodes);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);

  const comments = data.content
    ? Array.isArray(data.content)
      ? data.content
      : [data.content]
    : [];
  const displayComment = comments.length > 0 ? comments[comments.length - 1] : null;

  const handleStartEdit = () => {
    if (displayComment) {
      setEditValue(displayComment.text);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (!editValue.trim() || !displayComment || loading) return;
    setLoading(true);
    const currentComments = Array.isArray(data.content) ? data.content : data.content ? [data.content] : [];
    const updated = [...currentComments];
    if (updated.length > 0) {
      updated[updated.length - 1] = { ...updated[updated.length - 1], text: editValue.trim() };
    }
    updateNodeData(id, { content: updated });
    setIsEditing(false);
    setEditValue("");
    setLoading(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleResolve = () => {
    removeNode(id);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;
    setLoading(true);
    const newComment = {
      id: `comment-${Date.now()}`,
      text: inputValue.trim(),
      author: DEFAULT_AUTHOR,
      date: new Date().toISOString(),
    };
    const currentComments = Array.isArray(data.content) ? data.content : data.content ? [data.content] : [];
    updateNodeData(id, { content: [...currentComments, newComment] });
    setInputValue("");
    setLoading(false);
  };

  const handleAvatarClick = () => {
    if (selected) {
      onNodesChange([{ type: "select", id, selected: false }]);
    } else {
      const changes = nodes
        .filter((n) => n.id !== id)
        .map((n) => ({ type: "select" as const, id: n.id, selected: false }))
        .concat([{ type: "select" as const, id, selected: true }]);
      onNodesChange(changes);
    }
  };

  if (comments.length === 0) {
    return (
      <div className="relative p-3 rounded-2xl bg-neutral-800 ring-1 ring-neutral-600 min-w-[320px] w-full overflow-hidden">
        <form onSubmit={handleSubmit} className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-neutral-600 flex items-center justify-center text-neutral-300 text-xs">
            {getInitials(DEFAULT_AUTHOR)}
          </div>
          <input
            type="text"
            placeholder="Leave a comment"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-neutral-700 border border-neutral-600 px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500"
            disabled={loading}
          />
          <button
            type="submit"
            className="h-8 w-8 rounded-full shrink-0 bg-white text-neutral-900 flex items-center justify-center hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !inputValue.trim()}
          >
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
      </div>
    );
  }

  const commentAuthor = (displayComment as { author?: string })?.author || DEFAULT_AUTHOR;

  return (
    <div className="group relative" data-id="comment-body" data-state={selected ? "open" : "closed"}>
      <div
        className={`absolute -left-3 -top-3 ${selected ? "pointer-events-auto" : "pointer-events-none group-hover:pointer-events-auto"}`}
        data-id="comment-body-open"
      >
        {selected && (
          <div className="absolute left-1/2 top-0 -translate-x-1/2 pb-2 pointer-events-auto">
            <div className="flex h-10 items-center rounded-2xl bg-neutral-800 ring-1 ring-neutral-600 px-1 gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResolve();
                }}
                className="h-8 w-8 flex items-center justify-center rounded-2xl text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
                title="Resolve (delete)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.801 10A10 10 0 1 1 17 3.335" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit();
                }}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div
          className={`flex gap-2 rounded-2xl p-3 pb-4 transition-transform w-64 bg-neutral-800 ring-1 ring-neutral-600 ${
            selected ? "scale-100 w-fit min-w-64 max-w-[28rem]" : "scale-0 group-hover:scale-100 origin-[2rem_2rem]"
          }`}
        >
          <div className="h-8 w-8 shrink-0" />
          <div className="flex flex-col gap-0.5 text-neutral-100 min-w-0 flex-1">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-xl bg-neutral-700 border border-neutral-600 px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500"
                  disabled={loading}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="h-7 px-2 text-sm text-neutral-400 hover:text-neutral-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={loading || !editValue.trim()}
                    className="h-7 px-2 text-sm bg-white text-neutral-900 rounded hover:bg-neutral-200 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-h-6 gap-2 overflow-hidden">
                  <span className="whitespace-nowrap truncate">{commentAuthor}</span>
                  <span className="shrink-0 whitespace-nowrap text-neutral-500 text-xs">
                    {displayComment ? getTimeAgo(displayComment.date) : ""}
                  </span>
                </div>
                <div
                  className={`min-h-6 pr-4 ${
                    selected ? "max-h-[640px] overflow-y-auto whitespace-pre-wrap break-words" : "line-clamp-3"
                  }`}
                >
                  {displayComment?.text || ""}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className="relative h-8 w-8 shrink-0 rounded-full border border-neutral-600 p-px cursor-pointer overflow-hidden bg-neutral-700 flex items-center justify-center text-neutral-300 text-xs hover:border-neutral-500 transition-colors"
        data-id="comment-avatar"
        onClick={(e) => {
          e.stopPropagation();
          handleAvatarClick();
        }}
      >
        {getInitials(commentAuthor)}
      </div>
    </div>
  );
}
