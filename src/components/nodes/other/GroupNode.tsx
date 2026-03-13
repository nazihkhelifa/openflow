"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { NodeProps, NodeResizer, Node as FlowNode } from "@xyflow/react";
import { useWorkflowStore, GROUP_COLORS } from "@/store/workflowStore";
import { NodeGroup, GroupColor } from "@/types";

// Header height constant
const HEADER_HEIGHT = 32;

interface GroupNodeData extends Record<string, unknown> {
  groupId: string;
}

type GroupNodeType = FlowNode<GroupNodeData, "group">;

const COLOR_OPTIONS: { color: GroupColor; label: string }[] = [
  { color: "neutral", label: "Gray" },
  { color: "blue", label: "Blue" },
  { color: "green", label: "Green" },
  { color: "purple", label: "Purple" },
  { color: "orange", label: "Orange" },
  { color: "red", label: "Red" },
];

export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  const { groups, updateGroup, deleteGroup, moveGroupNodes } = useWorkflowStore();
  const groupId = data.groupId;
  const group = groups[groupId];

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name || "");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Update editName when group name changes externally
  useEffect(() => {
    if (group?.name && !isEditing) {
      setEditName(group.name);
    }
  }, [group?.name, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };

    if (showColorPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColorPicker]);

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== group?.name) {
      updateGroup(groupId, { name: editName.trim() });
    } else {
      setEditName(group?.name || "");
    }
    setIsEditing(false);
  }, [editName, group?.name, groupId, updateGroup]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleNameSubmit();
      } else if (e.key === "Escape") {
        setEditName(group?.name || "");
        setIsEditing(false);
      }
    },
    [handleNameSubmit, group?.name]
  );

  const handleColorChange = useCallback(
    (color: GroupColor) => {
      updateGroup(groupId, { color });
      setShowColorPicker(false);
    },
    [groupId, updateGroup]
  );

  const handleDelete = useCallback(() => {
    deleteGroup(groupId);
  }, [groupId, deleteGroup]);

  // Header drag handlers
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start drag if clicking on header background, not buttons/inputs
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest("input")
      ) {
        return;
      }
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Only move if there's significant movement
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        moveGroupNodes(groupId, { x: deltaX, y: deltaY });
        dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, groupId, moveGroupNodes]);

  if (!group) return null;

  const bgColor = GROUP_COLORS[group.color];

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={100}
        lineClassName="!border-transparent"
        handleClassName="!w-3 !h-3 !bg-neutral-500/50 !border-neutral-400 hover:!bg-neutral-400"
      />
      <div
        className="w-full h-full rounded-xl overflow-hidden"
        style={{
          backgroundColor: `${bgColor}60`,
          border: `1px solid ${bgColor}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 h-8 cursor-grab active:cursor-grabbing select-none"
          style={{ backgroundColor: `${bgColor}` }}
          onMouseDown={handleHeaderMouseDown}
        >
          {/* Editable Name */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-white px-0 py-0"
              style={{ minWidth: 0 }}
            />
          ) : (
            <span
              className="flex-1 text-sm font-medium text-white truncate cursor-text"
              onClick={() => setIsEditing(true)}
            >
              {group.name}
            </span>
          )}

          {/* Color Picker */}
          <div className="relative" ref={colorPickerRef}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-5 h-5 rounded border border-white/30 hover:border-white/60 transition-colors"
              style={{ backgroundColor: bgColor }}
              title="Change color"
            />
            {showColorPicker && (
              <div className="absolute top-full right-0 mt-1 p-2 bg-neutral-800 rounded-lg shadow-xl border border-neutral-600 grid grid-cols-4 gap-1.5 z-50">
                {COLOR_OPTIONS.map(({ color, label }) => (
                  <button
                    key={color}
                    onClick={() => handleColorChange(color)}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      group.color === color
                        ? "border-white scale-110"
                        : "border-transparent hover:border-white/50"
                    }`}
                    style={{ backgroundColor: GROUP_COLORS[color] }}
                    title={label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="p-0.5 rounded hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title="Delete group"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content area (empty, nodes render on top) */}
        <div className="w-full" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }} />
      </div>
    </>
  );
}
