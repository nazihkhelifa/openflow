"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { NodeType } from "@/types";

// Actions are special menu items that trigger behavior instead of creating a node
export type MenuAction = never;

interface MenuOption {
  type: NodeType | MenuAction;
  label: string;
  icon: React.ReactNode;
  isAction?: boolean; // true if this is an action, not a node type
}

const GENERIC_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5v14" />
  </svg>
);

const IMAGE_TARGET_OPTIONS: MenuOption[] = [
  { type: "annotation", label: "Layer Editor", icon: GENERIC_ICON },
  { type: "prompt", label: "Prompt", icon: GENERIC_ICON },
  { type: "generateImage", label: "Generate Image", icon: GENERIC_ICON },
  { type: "cameraAngleControl", label: "Camera Angle", icon: GENERIC_ICON },
  { type: "generateVideo", label: "Generate Video", icon: GENERIC_ICON },
  { type: "generate3d", label: "Generate 3D", icon: GENERIC_ICON },
  { type: "imageCompare", label: "Image Compare", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const TEXT_TARGET_OPTIONS: MenuOption[] = [
  { type: "prompt", label: "Prompt", icon: GENERIC_ICON },
  { type: "generateImage", label: "Generate Image", icon: GENERIC_ICON },
  { type: "generateVideo", label: "Generate Video", icon: GENERIC_ICON },
  { type: "generate3d", label: "Generate 3D", icon: GENERIC_ICON },
  { type: "generateAudio", label: "Generate Audio", icon: GENERIC_ICON },
  { type: "conditionalSwitch", label: "Conditional Switch", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const IMAGE_SOURCE_OPTIONS: MenuOption[] = [
  { type: "mediaInput", label: "Upload", icon: GENERIC_ICON },
  { type: "annotation", label: "Layer Editor", icon: GENERIC_ICON },
  { type: "generateImage", label: "Generate Image", icon: GENERIC_ICON },
  { type: "cameraAngleControl", label: "Camera Angle", icon: GENERIC_ICON },
  { type: "generate3d", label: "Generate 3D", icon: GENERIC_ICON },
  { type: "glbViewer", label: "3D Viewer", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const TEXT_SOURCE_OPTIONS: MenuOption[] = [
  { type: "prompt", label: "Prompt", icon: GENERIC_ICON },
  { type: "conditionalSwitch", label: "Conditional Switch", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const VIDEO_TARGET_OPTIONS: MenuOption[] = [
  { type: "easeCurve", label: "Ease Curve", icon: GENERIC_ICON },
  { type: "generateVideo", label: "Generate Video", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const VIDEO_SOURCE_OPTIONS: MenuOption[] = [
  { type: "mediaInput", label: "Upload", icon: GENERIC_ICON },
  { type: "generateVideo", label: "Generate Video", icon: GENERIC_ICON },
  { type: "easeCurve", label: "Ease Curve", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const AUDIO_TARGET_OPTIONS: MenuOption[] = [
  { type: "mediaInput", label: "Upload", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const AUDIO_SOURCE_OPTIONS: MenuOption[] = [
  { type: "mediaInput", label: "Upload", icon: GENERIC_ICON },
  { type: "generateAudio", label: "Generate Audio", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const THREE_D_TARGET_OPTIONS: MenuOption[] = [
  { type: "glbViewer", label: "3D Viewer", icon: GENERIC_ICON },
  { type: "mediaInput", label: "Upload", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const THREE_D_SOURCE_OPTIONS: MenuOption[] = [
  { type: "generate3d", label: "Generate 3D", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const EASE_CURVE_TARGET_OPTIONS: MenuOption[] = [
  { type: "easeCurve", label: "Ease Curve", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

const EASE_CURVE_SOURCE_OPTIONS: MenuOption[] = [
  { type: "easeCurve", label: "Ease Curve", icon: GENERIC_ICON },
  { type: "router", label: "Router", icon: GENERIC_ICON },
  { type: "switch", label: "Switch", icon: GENERIC_ICON },
];

interface ConnectionDropMenuProps {
  position: { x: number; y: number };
  handleType: "image" | "text" | "video" | "audio" | "3d" | "easeCurve" | null;
  connectionType: "source" | "target"; // source = dragging from output, target = dragging from input
  onSelect: (selection: { type: NodeType | MenuAction; isAction: boolean }) => void;
  onClose: () => void;
}

export function ConnectionDropMenu({
  position,
  handleType,
  connectionType,
  onSelect,
  onClose,
}: ConnectionDropMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const panelClassName =
    "fixed z-[200] w-80 max-w-80 rounded-xl border border-neutral-700/40 bg-[var(--background-transparent-black-default)] backdrop-blur-lg overflow-hidden outline-none";

  const sectionTitleClassName =
    "select-none px-3 py-2 text-[11px] text-neutral-400";

  const rowClassName =
    "w-full rounded-lg px-4 pl-2 flex h-[51px] justify-start gap-2 whitespace-normal bg-transparent font-normal text-[12px] text-neutral-200 hover:bg-white/10 transition-colors items-center text-left";

  const iconTileClassName =
    "flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950/60 p-2 text-neutral-300";

  // Get the appropriate node options based on handle type and connection direction
  const getOptions = useCallback((): MenuOption[] => {
    if (!handleType) return [];

    if (connectionType === "source") {
      // Dragging from a source handle (output), need nodes with target handles (inputs)
      if (handleType === "video") return VIDEO_TARGET_OPTIONS;
      if (handleType === "audio") return AUDIO_TARGET_OPTIONS;
      if (handleType === "3d") return THREE_D_TARGET_OPTIONS;
      if (handleType === "easeCurve") return EASE_CURVE_TARGET_OPTIONS;
      return handleType === "image" ? IMAGE_TARGET_OPTIONS : TEXT_TARGET_OPTIONS;
    } else {
      // Dragging from a target handle (input), need nodes with source handles (outputs)
      if (handleType === "video") return VIDEO_SOURCE_OPTIONS;
      if (handleType === "audio") return AUDIO_SOURCE_OPTIONS;
      if (handleType === "3d") return THREE_D_SOURCE_OPTIONS;
      if (handleType === "easeCurve") return EASE_CURVE_SOURCE_OPTIONS;
      return handleType === "image" ? IMAGE_SOURCE_OPTIONS : TEXT_SOURCE_OPTIONS;
    }
  }, [handleType, connectionType]);

  const options = getOptions();

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % options.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
          break;
        case "Enter":
          e.preventDefault();
          if (options[selectedIndex]) {
            onSelect({
              type: options[selectedIndex].type,
              isAction: options[selectedIndex].isAction || false,
            });
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [options, selectedIndex, onSelect, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Focus the menu when it opens
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  if (options.length === 0) return null;

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      className={panelClassName}
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="flex flex-col px-1 py-1">
        <div className={sectionTitleClassName}>
          Add {handleType} node
        </div>
      </div>
      <div className="px-1 py-1 max-h-[320px] overflow-y-auto">
        {options.map((option, index) => (
          <button
            key={option.type}
            onClick={() => onSelect({ type: option.type, isAction: option.isAction || false })}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`${rowClassName} ${index === selectedIndex ? "bg-white/10" : ""}`}
          >
            <div className={iconTileClassName}>{option.icon}</div>
            <div className="relative flex h-8 items-center text-left">
              <span className="select-none truncate">{option.label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
