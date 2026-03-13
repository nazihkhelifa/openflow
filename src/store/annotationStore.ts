import { create } from "zustand";
import { AnnotationShape, ImageLayer, LayerItem, ToolType, ToolOptions, isImageLayer, isAnnotationShape, isLayerLocked } from "@/types";

export type LayerOrderAction = "front" | "forward" | "backward" | "back";

export type ExportFormat = "png" | "jpeg";

interface AnnotationStore {
  // Modal state
  isModalOpen: boolean;
  sourceNodeId: string | null;
  /** Unified layers: images, shapes, text, drawings - all in z-order (0=back, last=front) */
  unifiedLayers: LayerItem[];
  selectedLayerId: string | null;
  /** Canvas preset id (e.g. "1:1", "16:9", "instagram-story") - defines output dimensions */
  canvasPresetId: string;
  /** Clipboard for copy/paste */
  clipboard: LayerItem[];
  /** Export format for flatten. Default "png". */
  exportFormat: ExportFormat;
  /** JPEG quality 0-1. Default 0.92. */
  exportQuality: number;
  /** Guides for snapping: x positions (vertical lines), y positions (horizontal lines) */
  guides: { x: number[]; y: number[] };
  guidesVisible: boolean;

  // History for undo/redo
  history: LayerItem[][];
  historyIndex: number;

  // Current tool and options
  currentTool: ToolType;
  toolOptions: ToolOptions;

  // Modal actions
  openModal: (
    nodeId: string,
    imageOrLayers: string | string[],
    existingAnnotations?: AnnotationShape[],
    imageLayerTransforms?: { x: number; y: number; scaleX: number; scaleY: number }[]
  ) => void;
  closeModal: () => void;
  /** Remove image layers that are no longer connected (when user disconnects edges). */
  refreshLayersFromConnections: (connectedImageUrls: string[]) => void;

  // Layer ordering (works on any layer by index)
  reorderLayer: (index: number, action: LayerOrderAction) => void;

  // Layer actions
  addAnnotation: (shape: AnnotationShape) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationShape>) => void;
  updateImageLayer: (id: string, updates: Partial<Pick<ImageLayer, "x" | "y" | "scaleX" | "scaleY" | "blendMode">>) => void;
  deleteLayer: (id: string) => void;
  clearAnnotations: () => void;
  selectLayer: (id: string | null) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  duplicateLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  alignSelected: (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom", canvasW: number, canvasH: number) => void;

  // Clipboard
  copyLayers: (ids: string[]) => void;
  pasteLayers: () => void;

  // History actions
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // Tool actions
  setCurrentTool: (tool: ToolType) => void;
  setToolOptions: (options: Partial<ToolOptions>) => void;

  // Canvas
  setCanvasPreset: (presetId: string) => void;
  setExportFormat: (format: ExportFormat) => void;
  setExportQuality: (quality: number) => void;
  addGuide: (axis: "x" | "y", value: number) => void;
  removeGuide: (axis: "x" | "y", value: number) => void;
  clearGuides: () => void;
  setGuidesVisible: (visible: boolean) => void;
}

const defaultToolOptions: ToolOptions = {
  strokeColor: "#ef4444",
  strokeWidth: 3,
  fillColor: null,
  fontSize: 24,
  fontFamily: "Arial",
  opacity: 1,
};

function buildUnifiedLayers(
  imageUrls: string[],
  annotations: AnnotationShape[],
  imageLayerTransforms?: { x: number; y: number; scaleX: number; scaleY: number }[]
): LayerItem[] {
  const imageLayers: ImageLayer[] = imageUrls.map((url, i) => {
    const t = imageLayerTransforms?.[i];
    return {
      id: `layer-img-${i}`,
      type: "image",
      url,
      x: t?.x ?? 0,
      y: t?.y ?? 0,
      scaleX: t?.scaleX ?? 1,
      scaleY: t?.scaleY ?? 1,
    };
  });
  return [...imageLayers, ...annotations];
}

function getLayerBounds(item: LayerItem, canvasW: number, canvasH: number): { x: number; y: number; w: number; h: number } {
  if (isImageLayer(item)) {
    const w = canvasW * item.scaleX;
    const h = canvasH * item.scaleY;
    return { x: item.x, y: item.y, w, h };
  }
  const s = item as AnnotationShape;
  if (s.type === "rectangle") {
    const r = s as import("@/types").RectangleShape;
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  if (s.type === "circle") {
    const c = s as import("@/types").CircleShape;
    return { x: c.x - c.radiusX, y: c.y - c.radiusY, w: c.radiusX * 2, h: c.radiusY * 2 };
  }
  if (s.type === "arrow" || s.type === "freehand") {
    const pts = (s as import("@/types").ArrowShape | import("@/types").FreehandShape).points;
    let minX = s.x, minY = s.y, maxX = s.x, maxY = s.y;
    for (let i = 0; i < pts.length; i += 2) {
      const px = s.x + pts[i];
      const py = s.y + pts[i + 1];
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    return { x: minX, y: minY, w: maxX - minX || 1, h: maxY - minY || 1 };
  }
  if (s.type === "text") {
    const t = s as import("@/types").TextShape;
    const estW = (t.text?.length ?? 1) * t.fontSize * 0.6;
    return { x: t.x, y: t.y, w: estW, h: t.fontSize * 1.2 };
  }
  return { x: s.x, y: s.y, w: 1, h: 1 };
}

function extractForNode(unifiedLayers: LayerItem[]): {
  layers: string[];
  imageLayerTransforms: { x: number; y: number; scaleX: number; scaleY: number }[];
  annotations: AnnotationShape[];
} {
  const layers: string[] = [];
  const imageLayerTransforms: { x: number; y: number; scaleX: number; scaleY: number }[] = [];
  const annotations: AnnotationShape[] = [];
  for (const item of unifiedLayers) {
    if (isImageLayer(item)) {
      layers.push(item.url);
      imageLayerTransforms.push({ x: item.x, y: item.y, scaleX: item.scaleX, scaleY: item.scaleY });
    } else {
      annotations.push(item);
    }
  }
  return { layers, imageLayerTransforms, annotations };
}

export const useAnnotationStore = create<AnnotationStore>((set, get) => ({
  isModalOpen: false,
  sourceNodeId: null,
  unifiedLayers: [],
  selectedLayerId: null,
  canvasPresetId: "1:1",
  clipboard: [],
  exportFormat: "png",
  exportQuality: 0.92,
  guides: { x: [], y: [] },
  guidesVisible: true,
  history: [[]],
  historyIndex: 0,
  currentTool: "rectangle",
  toolOptions: defaultToolOptions,

  openModal: (
    nodeId: string,
    imageOrLayers: string | string[],
    existingAnnotations: AnnotationShape[] = [],
    imageLayerTransforms?: { x: number; y: number; scaleX: number; scaleY: number }[]
  ) => {
    const urls = Array.isArray(imageOrLayers) ? imageOrLayers : [imageOrLayers];
    const unified = buildUnifiedLayers(urls, existingAnnotations, imageLayerTransforms);
    set({
      isModalOpen: true,
      sourceNodeId: nodeId,
      unifiedLayers: unified,
      selectedLayerId: null,
      history: [unified],
      historyIndex: 0,
    });
  },

  closeModal: () => {
    set({
      isModalOpen: false,
      sourceNodeId: null,
      unifiedLayers: [],
      selectedLayerId: null,
      canvasPresetId: "1:1",
      clipboard: [],
      history: [[]],
      historyIndex: 0,
    });
  },

  refreshLayersFromConnections: (connectedImageUrls: string[]) => {
    const { isModalOpen, unifiedLayers } = get();
    if (!isModalOpen || connectedImageUrls.length === 0) return;
    const currentImageUrls = unifiedLayers.filter(isImageLayer).map((l) => l.url);
    const connectedSet = new Set(connectedImageUrls);
    const hasRemoved = currentImageUrls.some((url) => !connectedSet.has(url));
    const hasAdded = connectedImageUrls.some((url) => !currentImageUrls.includes(url));
    const orderChanged = currentImageUrls.length === connectedImageUrls.length && connectedImageUrls.some((url, i) => currentImageUrls[i] !== url);
    if (!hasRemoved && !hasAdded && !orderChanged) return;
    const annotations = unifiedLayers.filter((item) => !isImageLayer(item)) as AnnotationShape[];
    const urlToLayer = new Map(unifiedLayers.filter(isImageLayer).map((l) => [l.url, l]));
    const newImageLayers: ImageLayer[] = connectedImageUrls.map((url, i) => {
      const existing = urlToLayer.get(url);
      return existing
        ? { ...existing, id: `layer-img-${i}` }
        : {
            id: `layer-img-${i}`,
            type: "image",
            url,
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
          };
    });
    set({
      unifiedLayers: [...newImageLayers, ...annotations],
      selectedLayerId: null,
    });
  },

  setCanvasPreset: (presetId: string) => {
    set({ canvasPresetId: presetId });
  },

  reorderLayer: (index: number, action: LayerOrderAction) => {
    const { unifiedLayers } = get();
    if (index < 0 || index >= unifiedLayers.length) return;
    const newLayers = [...unifiedLayers];
    const item = newLayers[index];
    newLayers.splice(index, 1);
    if (action === "front") {
      newLayers.push(item);
    } else if (action === "forward") {
      newLayers.splice(Math.min(index + 1, newLayers.length), 0, item);
    } else if (action === "backward") {
      newLayers.splice(Math.max(index - 1, 0), 0, item);
    } else {
      newLayers.unshift(item);
    }
    set({ unifiedLayers: newLayers });
  },

  addAnnotation: (shape: AnnotationShape) => {
    const { pushHistory } = get();
    pushHistory();
    set((state) => ({
      unifiedLayers: [...state.unifiedLayers, shape],
    }));
  },

  updateAnnotation: (id: string, updates: Partial<AnnotationShape>) => {
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((item) =>
        !isImageLayer(item) && item.id === id ? { ...item, ...updates } as AnnotationShape : item
      ),
    }));
  },

  updateImageLayer: (id: string, updates: Partial<Pick<ImageLayer, "x" | "y" | "scaleX" | "scaleY" | "blendMode">>) => {
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((item) =>
        isImageLayer(item) && item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  deleteLayer: (id: string) => {
    const { pushHistory } = get();
    pushHistory();
    set((state) => ({
      unifiedLayers: state.unifiedLayers.filter((item) => item.id !== id),
      selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
    }));
  },

  clearAnnotations: () => {
    const { pushHistory } = get();
    pushHistory();
    set((state) => ({
      unifiedLayers: state.unifiedLayers.filter(isImageLayer),
      selectedLayerId: null,
    }));
  },

  selectLayer: (id: string | null) => {
    set({ selectedLayerId: id });
  },

  toggleLayerVisibility: (id: string) => {
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((item) =>
        item.id === id ? { ...item, visible: item.visible === false } : item
      ),
    }));
  },

  toggleLayerLock: (id: string) => {
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((item) =>
        item.id === id ? { ...item, locked: !item.locked } : item
      ),
      selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
    }));
  },

  duplicateLayer: (id: string) => {
    const { unifiedLayers, pushHistory } = get();
    const index = unifiedLayers.findIndex((item) => item.id === id);
    if (index < 0) return;
    const item = unifiedLayers[index];
    pushHistory();
    const newItem = JSON.parse(JSON.stringify(item)) as LayerItem;
    newItem.id = isImageLayer(newItem) ? `layer-img-${Date.now()}` : `shape-${Date.now()}`;
    const newLayers = [...unifiedLayers];
    newLayers.splice(index + 1, 0, newItem);
    set({ unifiedLayers: newLayers, selectedLayerId: newItem.id });
  },

  copyLayers: (ids: string[]) => {
    const { unifiedLayers } = get();
    const items = unifiedLayers.filter((item) => ids.includes(item.id));
    set({ clipboard: items.map((item) => JSON.parse(JSON.stringify(item))) });
  },

  renameLayer: (id: string, name: string) => {
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((item) =>
        item.id === id ? { ...item, name } : item
      ),
    }));
  },

  alignSelected: (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom", canvasW: number, canvasH: number) => {
    const { unifiedLayers, selectedLayerId, pushHistory } = get();
    if (!selectedLayerId) return;
    const item = unifiedLayers.find((l) => l.id === selectedLayerId);
    if (!item || isLayerLocked(item)) return;
    pushHistory();
    const bounds = getLayerBounds(item, canvasW, canvasH);
    let newX = item.x;
    let newY = "y" in item ? item.y : (item as ImageLayer).y;
    if (alignment === "left") newX = 0;
    else if (alignment === "center") newX = (canvasW - bounds.w) / 2;
    else if (alignment === "right") newX = canvasW - bounds.w;
    else if (alignment === "top") newY = 0;
    else if (alignment === "middle") newY = (canvasH - bounds.h) / 2;
    else if (alignment === "bottom") newY = canvasH - bounds.h;
    set((state) => ({
      unifiedLayers: state.unifiedLayers.map((i) =>
        i.id === selectedLayerId
          ? isImageLayer(i)
            ? { ...i, x: alignment !== "top" && alignment !== "middle" && alignment !== "bottom" ? newX : i.x, y: alignment !== "left" && alignment !== "center" && alignment !== "right" ? newY : i.y }
            : { ...i, x: alignment !== "top" && alignment !== "middle" && alignment !== "bottom" ? newX : (i as AnnotationShape).x, y: alignment !== "left" && alignment !== "center" && alignment !== "right" ? newY : (i as AnnotationShape).y }
          : i
      ),
    }));
  },

  pasteLayers: () => {
    const { unifiedLayers, clipboard, pushHistory } = get();
    if (clipboard.length === 0) return;
    pushHistory();
    const newItems = clipboard.map((item) => {
      const copy = JSON.parse(JSON.stringify(item)) as LayerItem;
      copy.id = isImageLayer(copy) ? `layer-img-${Date.now()}-${Math.random().toString(36).slice(2)}` : `shape-${Date.now()}`;
      if (isAnnotationShape(copy)) {
        (copy as AnnotationShape).x += 20;
        (copy as AnnotationShape).y += 20;
      } else {
        (copy as ImageLayer).x += 20;
        (copy as ImageLayer).y += 20;
      }
      return copy;
    });
    set({
      unifiedLayers: [...unifiedLayers, ...newItems],
      selectedLayerId: newItems[newItems.length - 1]?.id ?? null,
    });
  },

  pushHistory: () => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(state.unifiedLayers.map((item) => JSON.parse(JSON.stringify(item))));
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        return {
          historyIndex: newIndex,
          unifiedLayers: [...state.history[newIndex]],
          selectedLayerId: null,
        };
      }
      return state;
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        return {
          historyIndex: newIndex,
          unifiedLayers: [...state.history[newIndex]],
          selectedLayerId: null,
        };
      }
      return state;
    });
  },

  setCurrentTool: (tool: ToolType) => {
    set({ currentTool: tool, selectedLayerId: null });
  },

  setToolOptions: (options: Partial<ToolOptions>) => {
    set((state) => ({
      toolOptions: { ...state.toolOptions, ...options },
    }));
  },

  setExportFormat: (format: ExportFormat) => {
    set({ exportFormat: format });
  },

  setExportQuality: (quality: number) => {
    set({ exportQuality: Math.max(0, Math.min(1, quality)) });
  },

  addGuide: (axis: "x" | "y", value: number) => {
    set((state) => {
      const arr = [...state.guides[axis]];
      if (!arr.includes(value)) {
        arr.push(value);
        arr.sort((a, b) => a - b);
      }
      return { guides: { ...state.guides, [axis]: arr } };
    });
  },

  removeGuide: (axis: "x" | "y", value: number) => {
    set((state) => ({
      guides: {
        ...state.guides,
        [axis]: state.guides[axis].filter((v) => v !== value),
      },
    }));
  },

  clearGuides: () => {
    set({ guides: { x: [], y: [] } });
  },

  setGuidesVisible: (visible: boolean) => {
    set({ guidesVisible: visible });
  },
}));

export { extractForNode };
