"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Group, Image as KonvaImage, Rect, Ellipse, Arrow, Line, Text, Transformer } from "react-konva";
import { useAnnotationStore, extractForNode } from "@/store/annotationStore";
import { useWorkflowStore } from "@/store/workflowStore";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";
import {
  AnnotationShape,
  RectangleShape,
  CircleShape,
  ArrowShape,
  FreehandShape,
  TextShape,
  ToolType,
  ImageLayer,
  BlendMode,
  isImageLayer,
  isLayerVisible,
  isLayerLocked,
} from "@/types";
import Konva from "konva";
import { CANVAS_PRESETS, getPresetById } from "@/lib/canvasPresets";
import { Square, RectangleHorizontal, RectangleVertical, Check, Eye, EyeOff, Lock, LockOpen, Copy, Clipboard, Download, MousePointer2, Circle as CircleIcon, ArrowRight, Pencil, Type, Palette, Minus } from "lucide-react";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#000000",
  "#ffffff",
];

const STROKE_WIDTHS = [2, 4, 8];

const FONT_SIZES = [12, 14, 16, 18, 24, 32, 48, 64];

const FONT_FAMILIES = [
  { value: "Arial", label: "Arial" },
  { value: "Inter", label: "Inter" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "Verdana", label: "Verdana" },
  { value: "system-ui", label: "System" },
];

const isShapeTool = (t: string) => ["rectangle", "circle", "arrow", "freehand"].includes(t);

export function AnnotationModal() {
  const {
    isModalOpen,
    sourceNodeId,
    unifiedLayers,
    refreshLayersFromConnections,
    selectedLayerId,
    canvasPresetId,
    currentTool,
    toolOptions,
    closeModal,
    reorderLayer,
    addAnnotation,
    updateAnnotation,
    updateImageLayer,
    deleteLayer,
    clearAnnotations,
    selectLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    duplicateLayer,
    renameLayer,
    alignSelected,
    copyLayers,
    pasteLayers,
    clipboard,
    setCurrentTool,
    setToolOptions,
    setCanvasPreset,
    undo,
    redo,
    exportFormat,
    exportQuality,
    setExportFormat,
    setExportQuality,
    guides,
  } = useAnnotationStore();

  const [canvasDropdownOpen, setCanvasDropdownOpen] = useState(false);
  const canvasDropdownRef = useRef<HTMLDivElement>(null);

  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const [imageCache, setImageCache] = useState<Record<string, HTMLImageElement>>({});
  const [layerContextMenu, setLayerContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [currentShape, setCurrentShape] = useState<AnnotationShape | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const textInputCreatedAt = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [shapesDropdownOpen, setShapesDropdownOpen] = useState(false);
  const [shapeOptionsDropdownOpen, setShapeOptionsDropdownOpen] = useState(false);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const floatingDropdownRef = useRef<HTMLDivElement>(null);

  const BLEND_MODES: { value: BlendMode; label: string }[] = [
    { value: "source-over", label: "Normal" },
    { value: "multiply", label: "Multiply" },
    { value: "screen", label: "Screen" },
    { value: "overlay", label: "Overlay" },
    { value: "darken", label: "Darken" },
    { value: "lighten", label: "Lighten" },
    { value: "color-dodge", label: "Color Dodge" },
    { value: "color-burn", label: "Color Burn" },
    { value: "hard-light", label: "Hard Light" },
    { value: "soft-light", label: "Soft Light" },
    { value: "difference", label: "Difference" },
    { value: "exclusion", label: "Exclusion" },
  ];

  const snapToGuides = useCallback((val: number, axis: "x" | "y") => {
    const arr = guides[axis];
    const snapDist = 8;
    for (const g of arr) {
      if (Math.abs(val - g) < snapDist) return g;
    }
    return val;
  }, [guides]);

  const imageLayerUrls = unifiedLayers.filter(isImageLayer).map((l) => l.url);
  const firstImageUrl = imageLayerUrls[0];

  useEffect(() => {
    if (imageLayerUrls.length === 0) return;
    let cancelled = false;
    const urlsToLoad = [...new Set(imageLayerUrls)];
    Promise.all(
      urlsToLoad.map(
        (url) =>
          new Promise<[string, HTMLImageElement]>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve([url, img]);
            img.onerror = reject;
            img.src = url;
          })
      )
    ).then((entries) => {
      if (cancelled) return;
      setImageCache((prev) => Object.fromEntries([...Object.entries(prev), ...entries]));
    });
    return () => {
      cancelled = true;
    };
  }, [imageLayerUrls.join("|")]);

  const canvasPreset = getPresetById(canvasPresetId);
  const stageSizeFromPreset = canvasPreset
    ? { width: canvasPreset.width, height: canvasPreset.height }
    : { width: 1080, height: 1080 };

  useEffect(() => {
    if (!containerRef.current) return;
    const { width, height } = stageSizeFromPreset;
    const containerWidth = containerRef.current.clientWidth - 100;
    const containerHeight = containerRef.current.clientHeight - 100;
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const newScale = Math.min(scaleX, scaleY, 1);
    setScale(newScale);
    setStageSize({ width, height });
    setPosition({
      x: (containerWidth - width * newScale) / 2 + 50,
      y: (containerHeight - height * newScale) / 2 + 50,
    });
  }, [stageSizeFromPreset.width, stageSizeFromPreset.height]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (canvasDropdownRef.current && !canvasDropdownRef.current.contains(target)) setCanvasDropdownOpen(false);
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(target)) setExportDropdownOpen(false);
      if (floatingDropdownRef.current && !floatingDropdownRef.current.contains(target)) {
        setShapesDropdownOpen(false);
        setShapeOptionsDropdownOpen(false);
        setSizeDropdownOpen(false);
      }
    };
    if (canvasDropdownOpen || exportDropdownOpen || shapesDropdownOpen || shapeOptionsDropdownOpen || sizeDropdownOpen) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [canvasDropdownOpen, exportDropdownOpen, shapesDropdownOpen, shapeOptionsDropdownOpen, sizeDropdownOpen]);

  // When user removes an edge or pauses an edge, sync layers to connected images only.
  // getConnectedInputsPure already excludes paused edges (hasPause), so paused = not connected.
  useEffect(() => {
    if (!isModalOpen || !sourceNodeId || !nodes || !edges) return;
    const connected = getConnectedInputsPure(sourceNodeId, nodes, edges);
    const connectedImages = connected.images ?? [];
    if (connectedImages.length > 0) {
      refreshLayersFromConnections(connectedImages);
    }
  }, [isModalOpen, sourceNodeId, nodes, edges, refreshLayersFromConnections]);

  const selectedItem = selectedLayerId ? unifiedLayers.find((l) => l.id === selectedLayerId) : null;
  const selectedIsShape = selectedItem && !isImageLayer(selectedItem) && isShapeTool((selectedItem as AnnotationShape).type);
  const selectedIsText = selectedItem && !isImageLayer(selectedItem) && (selectedItem as AnnotationShape).type === "text";

  useEffect(() => {
    if (transformerRef.current && stageRef.current && selectedLayerId && currentTool === "select") {
      const node = stageRef.current.findOne(`#${selectedLayerId}`);
      transformerRef.current.nodes(node ? [node] : []);
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
    transformerRef.current?.getLayer()?.batchDraw();
  }, [selectedLayerId, currentTool]);

  useEffect(() => {
    if (!selectedLayerId || !selectedItem || isImageLayer(selectedItem)) return;
    const shape = selectedItem as AnnotationShape;
    if (isShapeTool(shape.type)) {
      setToolOptions({
        strokeColor: shape.stroke,
        strokeWidth: shape.strokeWidth,
        fillColor: (shape as RectangleShape | CircleShape).fill ?? null,
      });
    } else if (shape.type === "text") {
      const text = shape as TextShape;
      setToolOptions({
        strokeColor: text.fill,
        fontSize: text.fontSize,
        fontFamily: text.fontFamily ?? "Arial",
      });
    }
  }, [selectedLayerId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "d") {
        e.preventDefault();
        if (selectedLayerId) duplicateLayer(selectedLayerId);
        return;
      }
      if (mod && e.key === "c") {
        e.preventDefault();
        if (selectedLayerId) copyLayers([selectedLayerId]);
        return;
      }
      if (mod && e.key === "v") {
        e.preventDefault();
        pasteLayers();
        return;
      }
      if (!editingTextId && !document.activeElement?.matches("input, textarea")) {
        const toolKeys: Record<string, ToolType> = { v: "select", r: "rectangle", e: "circle", a: "arrow", p: "freehand", t: "text" };
        if (e.key.toLowerCase() in toolKeys && !mod) {
          e.preventDefault();
          setCurrentTool(toolKeys[e.key.toLowerCase()]);
          return;
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedLayerId && !editingTextId) {
          deleteLayer(selectedLayerId);
        }
      }
      if (e.key === "Escape") {
        if (editingTextId) {
          setEditingTextId(null);
          setTextInputPosition(null);
          setPendingTextPosition(null);
        } else {
          closeModal();
        }
      }
      if (mod && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, selectedLayerId, editingTextId, deleteLayer, closeModal, undo, redo, duplicateLayer, copyLayers, pasteLayers, setCurrentTool]);

  const getRelativePointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const transform = stage.getAbsoluteTransform().copy().invert();
    const pos = stage.getPointerPosition();
    if (!pos) return { x: 0, y: 0 };
    return transform.point(pos);
  }, []);

  const getLayerIdFromTarget = useCallback((target: Konva.Node) => {
    if (target.id() === "pan-background") return "pan-background";
    if (target.getClassName() === "Transformer") {
      const nodes = (target as Konva.Transformer).nodes();
      if (nodes?.length === 1) return nodes[0].id() || null;
      return null;
    }
    if (target.getParent()?.getClassName() === "Transformer") {
      const tr = target.getParent() as Konva.Transformer;
      const nodes = tr.nodes();
      if (nodes?.length === 1) return nodes[0].id() || null;
      return null;
    }
    if (target.getClassName() === "Group" && target.id()?.startsWith("layer-img-")) return target.id();
    if (target.getClassName() === "Image") {
      const parentId = target.getParent()?.id();
      if (parentId?.startsWith("layer-img-")) return parentId;
    }
    return target.id() || null;
  }, []);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (currentTool === "select") {
        const target = e.target;
        const clickedOnStage = target === target.getStage();
        const clickedOnKonvaLayer = target.getClassName() === "Layer";
        const layerId = getLayerIdFromTarget(target);
        if (layerId === "pan-background" || clickedOnStage || clickedOnKonvaLayer) {
          selectLayer(null);
          return;
        }
        if (layerId) {
          const item = unifiedLayers.find((l) => l.id === layerId);
          if (item && !isLayerLocked(item)) selectLayer(layerId);
          return;
        }
        return;
      }

      const pos = getRelativePointerPosition();
      setIsDrawing(true);
      setDrawStart(pos);

      const id = `shape-${Date.now()}`;
      const baseShape = {
        id,
        x: pos.x,
        y: pos.y,
        stroke: toolOptions.strokeColor,
        strokeWidth: toolOptions.strokeWidth,
        opacity: toolOptions.opacity,
      };

      let newShape: AnnotationShape | null = null;

      switch (currentTool) {
        case "rectangle":
          newShape = { ...baseShape, type: "rectangle", width: 0, height: 0, fill: toolOptions.fillColor } as RectangleShape;
          break;
        case "circle":
          newShape = { ...baseShape, type: "circle", radiusX: 0, radiusY: 0, fill: toolOptions.fillColor } as CircleShape;
          break;
        case "arrow":
          newShape = { ...baseShape, type: "arrow", points: [0, 0, 0, 0] } as ArrowShape;
          break;
        case "freehand":
          newShape = { ...baseShape, type: "freehand", points: [0, 0] } as FreehandShape;
          break;
        case "text": {
          // Calculate screen position for the input
          const stage = stageRef.current;
          if (stage) {
            const container = stage.container();
            const stageBox = container?.getBoundingClientRect();
            if (stageBox) {
              const screenX = stageBox.left + pos.x * scale + position.x;
              const screenY = stageBox.top + pos.y * scale + position.y;
              setTextInputPosition({ x: screenX, y: screenY });
              setPendingTextPosition({ x: pos.x, y: pos.y });
            }
          }
          textInputCreatedAt.current = Date.now();
          setEditingTextId("new");
          setIsDrawing(false);
          setTimeout(() => textInputRef.current?.focus(), 0);
          return;
        }
      }

      if (newShape) setCurrentShape(newShape);
    },
    [currentTool, toolOptions, getRelativePointerPosition, selectLayer, addAnnotation, scale, position, getLayerIdFromTarget, unifiedLayers]
  );

  const handleMouseMove = useCallback(() => {
    if (!isDrawing || !currentShape) return;
    const pos = getRelativePointerPosition();

    switch (currentShape.type) {
      case "rectangle": {
        const width = pos.x - drawStart.x;
        const height = pos.y - drawStart.y;
        setCurrentShape({ ...currentShape, x: width < 0 ? pos.x : drawStart.x, y: height < 0 ? pos.y : drawStart.y, width: Math.abs(width), height: Math.abs(height) } as RectangleShape);
        break;
      }
      case "circle": {
        const radiusX = Math.abs(pos.x - drawStart.x) / 2;
        const radiusY = Math.abs(pos.y - drawStart.y) / 2;
        setCurrentShape({ ...currentShape, x: (drawStart.x + pos.x) / 2, y: (drawStart.y + pos.y) / 2, radiusX, radiusY } as CircleShape);
        break;
      }
      case "arrow":
        setCurrentShape({ ...currentShape, points: [0, 0, pos.x - drawStart.x, pos.y - drawStart.y] } as ArrowShape);
        break;
      case "freehand": {
        const freehand = currentShape as FreehandShape;
        setCurrentShape({ ...freehand, points: [...freehand.points, pos.x - drawStart.x, pos.y - drawStart.y] } as FreehandShape);
        break;
      }
    }
  }, [isDrawing, currentShape, drawStart, getRelativePointerPosition]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentShape) return;
    setIsDrawing(false);

    let shouldAdd = true;
    if (currentShape.type === "rectangle") {
      const rect = currentShape as RectangleShape;
      shouldAdd = rect.width > 5 && rect.height > 5;
    } else if (currentShape.type === "circle") {
      const circle = currentShape as CircleShape;
      shouldAdd = circle.radiusX > 5 && circle.radiusY > 5;
    } else if (currentShape.type === "arrow") {
      const arrow = currentShape as ArrowShape;
      const dx = arrow.points[2];
      const dy = arrow.points[3];
      shouldAdd = Math.sqrt(dx * dx + dy * dy) > 10;
    }

    if (shouldAdd) addAnnotation(currentShape);
    setCurrentShape(null);
  }, [isDrawing, currentShape, addAnnotation]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const oldScale = scale;
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setScale(Math.min(Math.max(newScale, 0.1), 5));
  }, [scale]);

  const flattenImage = useCallback((): string => {
    const w = stageSize.width;
    const h = stageSize.height;

    const tempStage = new Konva.Stage({
      container: document.createElement("div"),
      width: w,
      height: h,
    });

    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);

    const bgRect = new Konva.Rect({ x: 0, y: 0, width: w, height: h, fill: "#1a1a1a" });
    tempLayer.add(bgRect);

    unifiedLayers.filter(isLayerVisible).forEach((item) => {
      if (isImageLayer(item)) {
        const img = imageCache[item.url];
        if (!img) return;
        const konvaImage = new Konva.Image({
          image: img,
          width: w,
          height: h,
          x: item.x,
          y: item.y,
          scaleX: item.scaleX,
          scaleY: item.scaleY,
          globalCompositeOperation: item.blendMode ?? "source-over",
        });
        tempLayer.add(konvaImage);
      } else {
        const shape = item;
        let konvaShape: Konva.Shape | null = null;
        switch (shape.type) {
        case "rectangle": {
          const rect = shape as RectangleShape;
          konvaShape = new Konva.Rect({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, stroke: rect.stroke, strokeWidth: rect.strokeWidth, fill: rect.fill || undefined, opacity: rect.opacity, globalCompositeOperation: rect.blendMode ?? "source-over" });
          break;
        }
        case "circle": {
          const circle = shape as CircleShape;
          konvaShape = new Konva.Ellipse({ x: circle.x, y: circle.y, radiusX: circle.radiusX, radiusY: circle.radiusY, stroke: circle.stroke, strokeWidth: circle.strokeWidth, fill: circle.fill || undefined, opacity: circle.opacity, globalCompositeOperation: circle.blendMode ?? "source-over" });
          break;
        }
        case "arrow": {
          const arrow = shape as ArrowShape;
          konvaShape = new Konva.Arrow({ x: arrow.x, y: arrow.y, points: arrow.points, stroke: arrow.stroke, strokeWidth: arrow.strokeWidth, fill: arrow.stroke, opacity: arrow.opacity, globalCompositeOperation: arrow.blendMode ?? "source-over" });
          break;
        }
        case "freehand": {
          const freehand = shape as FreehandShape;
          konvaShape = new Konva.Line({ x: freehand.x, y: freehand.y, points: freehand.points, stroke: freehand.stroke, strokeWidth: freehand.strokeWidth, opacity: freehand.opacity, lineCap: "round", lineJoin: "round", globalCompositeOperation: freehand.blendMode ?? "source-over" });
          break;
        }
        case "text": {
          const text = shape as TextShape;
          konvaShape = new Konva.Text({ x: text.x, y: text.y, text: text.text, fontSize: text.fontSize, fontFamily: text.fontFamily ?? "Arial", fill: text.fill, opacity: text.opacity, globalCompositeOperation: text.blendMode ?? "source-over" });
          break;
        }
      }
        if (konvaShape) tempLayer.add(konvaShape);
      }
    });

    tempLayer.draw();
    const mimeType = exportFormat === "jpeg" ? "image/jpeg" : "image/png";
    const dataUrl = tempStage.toDataURL({ pixelRatio: 1, mimeType, quality: exportFormat === "jpeg" ? exportQuality : undefined });
    tempStage.destroy();
    return dataUrl;
  }, [unifiedLayers, imageCache, stageSize.width, stageSize.height, exportFormat, exportQuality]);

  const handleDone = useCallback(() => {
    if (!sourceNodeId) return;
    const flattenedImage = flattenImage();
    const { layers, imageLayerTransforms, annotations } = extractForNode(unifiedLayers);
    updateNodeData(sourceNodeId, {
      annotations,
      layers,
      imageLayerTransforms,
      outputImage: flattenedImage,
      outputImageRef: undefined,
    });
    closeModal();
  }, [sourceNodeId, unifiedLayers, flattenImage, updateNodeData, closeModal]);

  const handleLayerContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setLayerContextMenu({ index, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    const closeContextMenu = () => setLayerContextMenu(null);
    if (layerContextMenu) {
      window.addEventListener("click", closeContextMenu);
      window.addEventListener("contextmenu", closeContextMenu);
      return () => {
        window.removeEventListener("click", closeContextMenu);
        window.removeEventListener("contextmenu", closeContextMenu);
      };
    }
  }, [layerContextMenu]);

  const renderShape = (shape: AnnotationShape, isPreview = false) => {
    const canEdit = currentTool === "select" && !isPreview && !isLayerLocked(shape);
    const commonProps = {
      id: shape.id,
      opacity: shape.opacity,
      globalCompositeOperation: shape.blendMode ?? "source-over",
      onClick: () => {
        if (canEdit) selectLayer(shape.id);
      },
      draggable: canEdit,
      dragBoundFunc: canEdit ? (pos: { x: number; y: number }) => ({ x: snapToGuides(pos.x, "x"), y: snapToGuides(pos.y, "y") }) : undefined,
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
        const node = e.target;
        updateAnnotation(shape.id, { x: node.x(), y: node.y() });
      },
    };

    switch (shape.type) {
      case "rectangle": {
        const rect = shape as RectangleShape;
        return (
          <Rect
            key={shape.id}
            {...commonProps}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            stroke={rect.stroke}
            strokeWidth={rect.strokeWidth}
            fill={rect.fill || undefined}
            onTransformEnd={(e) => {
              const node = e.target;
              const w = Math.max(5, node.width() * node.scaleX());
              const h = Math.max(5, node.height() * node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              updateAnnotation(shape.id, { x: node.x(), y: node.y(), width: w, height: h });
            }}
          />
        );
      }
      case "circle": {
        const circle = shape as CircleShape;
        return (
          <Ellipse
            key={shape.id}
            {...commonProps}
            x={circle.x}
            y={circle.y}
            radiusX={circle.radiusX}
            radiusY={circle.radiusY}
            stroke={circle.stroke}
            strokeWidth={circle.strokeWidth}
            fill={circle.fill || undefined}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Ellipse;
              const rX = Math.max(5, node.radiusX() * node.scaleX());
              const rY = Math.max(5, node.radiusY() * node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              updateAnnotation(shape.id, { x: node.x(), y: node.y(), radiusX: rX, radiusY: rY });
            }}
          />
        );
      }
      case "arrow": {
        const arrow = shape as ArrowShape;
        return (
          <Arrow
            key={shape.id}
            {...commonProps}
            x={arrow.x}
            y={arrow.y}
            points={arrow.points}
            stroke={arrow.stroke}
            strokeWidth={arrow.strokeWidth}
            fill={arrow.stroke}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Arrow;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              const newPoints = node.points().map((p, i) => (i % 2 === 0 ? p * sx : p * sy));
              updateAnnotation(shape.id, { x: node.x(), y: node.y(), points: newPoints });
            }}
          />
        );
      }
      case "freehand": {
        const freehand = shape as FreehandShape;
        return (
          <Line
            key={shape.id}
            {...commonProps}
            x={freehand.x}
            y={freehand.y}
            points={freehand.points}
            stroke={freehand.stroke}
            strokeWidth={freehand.strokeWidth}
            lineCap="round"
            lineJoin="round"
            onTransformEnd={(e) => {
              const node = e.target as Konva.Line;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              const newPoints = node.points().map((p, i) => (i % 2 === 0 ? p * sx : p * sy));
              updateAnnotation(shape.id, { x: node.x(), y: node.y(), points: newPoints });
            }}
          />
        );
      }
      case "text": {
        const text = shape as TextShape;
        return (
          <Text
            key={shape.id}
            {...commonProps}
            x={text.x}
            y={text.y}
            text={text.text || " "}
            fontSize={text.fontSize}
            fontFamily={text.fontFamily ?? toolOptions.fontFamily}
            fill={text.fill}
            onTransformEnd={(e) => {
              const node = e.target;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              // Reset scale and apply it to fontSize instead
              node.scaleX(1);
              node.scaleY(1);
              const newFontSize = Math.round(text.fontSize * Math.max(scaleX, scaleY));
              updateAnnotation(shape.id, {
                x: node.x(),
                y: node.y(),
                fontSize: newFontSize,
              });
            }}
            onDblClick={() => {
              if (currentTool === "select") {
                const stage = stageRef.current;
                if (stage) {
                  const stageBox = stage.container().getBoundingClientRect();
                  const screenX = stageBox.left + text.x * scale + position.x;
                  const screenY = stageBox.top + text.y * scale + position.y;
                  setTextInputPosition({ x: screenX, y: screenY });
                }
                setEditingTextId(shape.id);
                setTimeout(() => textInputRef.current?.focus(), 0);
              }
            }}
          />
        );
      }
    }
  };

  if (!isModalOpen) return null;

  const shapeTools: { type: ToolType; label: string; shortcut: string }[] = [
    { type: "rectangle", label: "Rect", shortcut: "R" },
    { type: "circle", label: "Circle", shortcut: "E" },
    { type: "arrow", label: "Arrow", shortcut: "A" },
    { type: "freehand", label: "Draw", shortcut: "P" },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center">
      {/* Floating toolbar + layers outside modal */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex items-start justify-center px-16">
        {/* Done / Cancel actions */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={handleDone}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-background-flora-green-primary text-text-positive-on-accent hover:bg-background-flora-green-secondary"
          >
            Done
          </button>
          <button
            onClick={closeModal}
            className="px-3 py-1.5 text-xs font-medium rounded-xl text-text-2 hover:text-text-1 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>

        {/* Toolbar - centered above canvas, FloatingActionBar style */}
        <div className="pointer-events-auto flex-1 flex justify-center">
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-[16px]"
            style={{ backgroundColor: "var(--background-transparent-black-default)" }}
          >
            {/* Canvas aspect ratio dropdown */}
            <div className="relative" ref={canvasDropdownRef}>
              <button
                onClick={() => setCanvasDropdownOpen((o) => !o)}
                className="flex h-8 items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-icon-1 hover:bg-white/5"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{canvasPreset?.label ?? "1:1"}</span>
                <svg className="w-3 h-3 text-icon-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {canvasDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-[130] w-56 max-h-[70vh] overflow-y-auto rounded-2xl border border-border-transparent-secondary bg-background-transparent-black shadow-xl py-1 f-effect-backdrop-blur-lg">
                  {CANVAS_PRESETS.map(({ group, presets }) => (
                    <div key={group}>
                      <div className="px-3 py-1.5 text-[10px] font-medium text-text-3 uppercase tracking-wide">
                        {group}
                      </div>
                      {presets.map((preset) => {
                        const isSelected = canvasPresetId === preset.id;
                        const Icon =
                          preset.width === preset.height
                            ? Square
                            : preset.width > preset.height
                              ? RectangleHorizontal
                              : RectangleVertical;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setCanvasPreset(preset.id);
                              setCanvasDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5 transition-colors"
                          >
                            <Icon className="w-3.5 h-3.5 text-icon-2 shrink-0" />
                            <span className="flex-1 text-text-2">{preset.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-icon-1 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1 h-4 w-px bg-border-transparent" />

            <button
              onClick={undo}
              className="flex h-8 items-center justify-center rounded-xl px-3 text-xs text-icon-2 hover:bg-white/5"
            >
              Undo
            </button>
            <button
              onClick={redo}
              className="flex h-8 items-center justify-center rounded-xl px-3 text-xs text-icon-2 hover:bg-white/5"
            >
              Redo
            </button>

            <div className="mx-1 h-4 w-px bg-border-transparent" />

            <button
              onClick={clearAnnotations}
              className="flex h-8 items-center justify-center rounded-xl px-3 text-xs text-danger-secondary hover:bg-danger-secondary/80"
            >
              Clear
            </button>

            <div className="mx-1 h-4 w-px bg-border-transparent" />

            <button
              onClick={() => selectedLayerId && copyLayers([selectedLayerId])}
              disabled={!selectedLayerId}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-icon-2 hover:bg-white/5 disabled:opacity-40"
              title="Copy (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={pasteLayers}
              disabled={clipboard.length === 0}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-icon-2 hover:bg-white/5 disabled:opacity-40"
              title="Paste (Ctrl+V)"
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>

            <div className="mx-1 h-4 w-px bg-border-transparent" />

            <div className="flex items-center gap-0.5" title="Align to canvas">
              <button
                onClick={() => alignSelected("left", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align left"
              >
                L
              </button>
              <button
                onClick={() => alignSelected("center", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align center"
              >
                C
              </button>
              <button
                onClick={() => alignSelected("right", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align right"
              >
                R
              </button>
              <button
                onClick={() => alignSelected("top", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align top"
              >
                T
              </button>
              <button
                onClick={() => alignSelected("middle", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align middle"
              >
                M
              </button>
              <button
                onClick={() => alignSelected("bottom", stageSize.width, stageSize.height)}
                disabled={!selectedLayerId}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-medium text-text-3 hover:bg-white/5 hover:text-text-1 disabled:opacity-40"
                title="Align bottom"
              >
                B
              </button>
            </div>
          </div>
        </div>

        {/* Layer Panel - right, FloatingActionBar style shell */}
        {unifiedLayers.length > 0 && (
          <aside
            className="pointer-events-auto ml-auto flex flex-col gap-2 rounded-2xl border border-border-transparent-secondary bg-background-transparent-black p-2 f-effect-backdrop-blur-lg"
            style={{ backgroundColor: "var(--background-transparent-black-default)" }}
          >
            <div className="bg-dark-1 rounded-2xl border border-border-alpha-light-1 overflow-hidden min-h-fit w-full f-effect-backdrop-blur-lg flex flex-col">
              {/* Header row: LAYERS + zoom like "LAYERS - 100% +" */}
              <div className="px-2 py-1.5 border-b border-border-alpha-light-1 flex items-center justify-between gap-2 bg-dark-1">
              <span className="text-[10px] font-medium text-text-3 uppercase tracking-wider">
                Layers
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setScale(Math.max(scale - 0.1, 0.1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] text-text-3 hover:bg-background-light-alpha-1 hover:text-text-1"
                  title="Zoom out"
                >
                  -
                </button>
                <span className="text-[11px] text-text-2 w-10 text-center tabular-nums">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale(Math.min(scale + 0.1, 5))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[11px] text-text-3 hover:bg-background-light-alpha-1 hover:text-text-1"
                  title="Zoom in"
                >
                  +
                </button>
              </div>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none [scrollbar-gutter:stable] bg-dark-2">
              {[...unifiedLayers].reverse().map((item, reversedIndex) => {
                const index = unifiedLayers.length - 1 - reversedIndex;
                const isSelected = selectedLayerId === item.id;
                const visible = isLayerVisible(item);
                const locked = isLayerLocked(item);
                const defaultName = isImageLayer(item)
                  ? `Image ${index + 1}`
                  : item.type === "rectangle"
                    ? "Rectangle"
                    : item.type === "circle"
                      ? "Ellipse"
                      : item.type === "arrow"
                        ? "Arrow"
                        : item.type === "freehand"
                          ? "Path"
                          : item.type === "text"
                            ? (item as TextShape).text || "Text"
                            : "Layer";
                const layerName = item.name ?? defaultName;
                return (
                  <div
                    key={item.id}
                    onClick={() => currentTool === "select" && !locked && selectLayer(item.id)}
                    onContextMenu={(e) => handleLayerContextMenu(e, index)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border-b border-[#2d2d2d]/50 transition-colors min-h-[36px] ${
                      isSelected ? "bg-[#2d5a9e]/40" : "hover:bg-[#2d2d2d]"
                    } ${!visible ? "opacity-50" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(item.id); }}
                      className="p-0.5 shrink-0 text-neutral-500 hover:text-neutral-300"
                      title={visible ? "Hide layer" : "Show layer"}
                    >
                      {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayerLock(item.id); }}
                      className="p-0.5 shrink-0 text-neutral-500 hover:text-neutral-300"
                      title={locked ? "Unlock layer" : "Lock layer"}
                    >
                      {locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                    </button>
                    <div className="w-9 h-9 shrink-0 rounded overflow-hidden bg-[#2d2d2d] flex items-center justify-center">
                      {isImageLayer(item) ? (
                        <img src={item.url} alt="" className="w-full h-full object-cover block" />
                      ) : (
                        <>
                          {item.type === "rectangle" && <div className="w-5 h-4 border border-white/60 rounded-sm" />}
                          {item.type === "circle" && <div className="w-4 h-4 rounded-full border border-white/60" />}
                          {item.type === "arrow" && <span className="text-white/70 text-sm">→</span>}
                          {item.type === "freehand" && <span className="text-white/70 text-xs">✎</span>}
                          {item.type === "text" && <span className="text-white/70 text-[10px] truncate max-w-full px-0.5">T</span>}
                        </>
                      )}
                    </div>
                    {editingLayerId === item.id ? (
                      <input
                        type="text"
                        value={editingLayerName}
                        onChange={(e) => setEditingLayerName(e.target.value)}
                        onBlur={() => {
                          if (editingLayerName.trim()) renameLayer(item.id, editingLayerName.trim());
                          setEditingLayerId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingLayerName.trim()) renameLayer(item.id, editingLayerName.trim());
                            setEditingLayerId(null);
                          }
                          if (e.key === "Escape") setEditingLayerId(null);
                        }}
                        autoFocus
                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-neutral-300 px-0.5"
                      />
                    ) : (
                      <span
                        className="flex-1 text-[11px] text-neutral-300 truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!locked) {
                            setEditingLayerId(item.id);
                            setEditingLayerName(layerName);
                          }
                        }}
                      >
                        {layerName}
                      </span>
                    )}
                    {isSelected && (
                      <select
                        value={(item as { blendMode?: BlendMode }).blendMode ?? "source-over"}
                        onChange={(e) => {
                          const mode = e.target.value as BlendMode;
                          if (isImageLayer(item)) updateImageLayer(item.id, { blendMode: mode });
                          else updateAnnotation(item.id, { blendMode: mode });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 text-[10px] bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-neutral-300 max-w-[72px] truncate"
                        title="Blend mode"
                      >
                        {BLEND_MODES.map((bm) => (
                          <option key={bm.value} value={bm.value}>{bm.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Left floating tool palette outside modal, fixed to viewport left-center, matching FloatingActionBar style */}
      <aside
        ref={floatingDropdownRef}
        className="fixed left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full p-2 backdrop-blur-[16px]"
        style={{ backgroundColor: "var(--background-transparent-black-default)" }}
        data-id="annotation-floating-toolbar"
      >
            {/* Select - direct button */}
            <button
              onClick={() => {
                setCurrentTool("select");
                setShapesDropdownOpen(false);
                setShapeOptionsDropdownOpen(false);
                setSizeDropdownOpen(false);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] transition-colors ${
                currentTool === "select" ? "bg-white/10 text-text-1" : "text-icon-2 hover:bg-white/5"
              }`}
              title="Select (V)"
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>

            {/* Shapes dropdown - Rect, Circle, Arrow, Draw */}
            <div className="relative">
              <button
                onClick={() => {
                  setShapesDropdownOpen((o) => !o);
                  setShapeOptionsDropdownOpen(false);
                  setSizeDropdownOpen(false);
                }}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] transition-colors ${
                  ["rectangle", "circle", "arrow", "freehand"].includes(currentTool)
                    ? "bg-white/10 text-text-1"
                    : "text-icon-2 hover:bg-white/5"
                }`}
                title="Shapes"
              >
                {currentTool === "rectangle" ? (
                  <Square className="w-3.5 h-3.5" />
                ) : currentTool === "circle" ? (
                  <CircleIcon className="w-3.5 h-3.5" />
                ) : currentTool === "arrow" ? (
                  <ArrowRight className="w-3.5 h-3.5" />
                ) : currentTool === "freehand" ? (
                  <Pencil className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
              {shapesDropdownOpen && (
                <div className="absolute left-full top-0 ml-2 z-[130] min-w-[140px] rounded-2xl border border-border-transparent-secondary bg-background-transparent-black py-1 shadow-xl f-effect-backdrop-blur-lg">
                  {shapeTools.map((tool) => {
                    const Icon =
                      tool.type === "rectangle"
                        ? Square
                        : tool.type === "circle"
                          ? CircleIcon
                          : tool.type === "arrow"
                            ? ArrowRight
                            : Pencil;
                    const isActive = currentTool === tool.type;
                    return (
                      <button
                        key={tool.type}
                        onClick={() => {
                          setCurrentTool(tool.type);
                          setShapesDropdownOpen(false);
                        }}
                        title={`${tool.label} (${tool.shortcut})`}
                        className={`mx-1 mb-1 flex w-[132px] items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs transition-colors ${
                          isActive ? "bg-white/10 text-text-1" : "text-text-2 hover:bg-white/5"
                        }`}
                      >
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive ? "text-text-1" : "text-icon-2"
                          }`}
                        />
                        <span>{tool.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Text - direct button */}
            <button
              onClick={() => {
                setCurrentTool("text");
                setShapesDropdownOpen(false);
                setShapeOptionsDropdownOpen(false);
                setSizeDropdownOpen(false);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] transition-colors ${
                currentTool === "text" ? "bg-white/10 text-text-1" : "text-icon-2 hover:bg-white/5"
              }`}
              title="Text (T)"
            >
              <Type className="w-3.5 h-3.5" />
            </button>

            {/* Separator */}
            {(isShapeTool(currentTool) || currentTool === "text" || selectedIsShape || selectedIsText) && (
              <div className="my-0.5 h-px w-full max-w-[32px] shrink-0 bg-border-transparent" aria-hidden />
            )}

            {/* Shape options: color, stroke, fill */}
            {(isShapeTool(currentTool) || selectedIsShape) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShapeOptionsDropdownOpen((o) => !o);
                    setShapesDropdownOpen(false);
                    setSizeDropdownOpen(false);
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] transition-colors ${
                    shapeOptionsDropdownOpen ? "bg-white/10 text-text-1" : "text-icon-2 hover:bg-white/5"
                  }`}
                  title="Shape options"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                {shapeOptionsDropdownOpen && (
                  <div className="absolute left-full top-0 ml-2 z-[130] min-w-[190px] rounded-2xl border border-border-transparent-secondary bg-background-transparent-black p-3 shadow-xl f-effect-backdrop-blur-lg">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Color
                    </div>
                    <div className="mb-3 grid grid-cols-4 gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setToolOptions({ strokeColor: color });
                            if (selectedLayerId && selectedIsShape) {
                              const s = selectedItem as AnnotationShape;
                              const updates: Partial<AnnotationShape> = { stroke: color };
                              if (
                                (s.type === "rectangle" || s.type === "circle") &&
                                (s as RectangleShape | CircleShape).fill
                              ) {
                                (updates as RectangleShape | CircleShape).fill = color;
                              }
                              updateAnnotation(selectedLayerId, updates);
                            }
                          }}
                          className={`h-7 w-7 rounded-full transition-transform ${
                            toolOptions.strokeColor === color
                              ? "ring-2 ring-white ring-offset-2 ring-offset-black/40 scale-110"
                              : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Stroke
                    </div>
                    <div className="mb-3 flex items-center gap-2">
                      {STROKE_WIDTHS.map((width) => (
                        <button
                          key={width}
                          onClick={() => {
                            setToolOptions({ strokeWidth: width });
                            if (selectedLayerId && selectedIsShape) {
                              updateAnnotation(selectedLayerId, { strokeWidth: width });
                            }
                          }}
                          className={`flex h-7 w-7 items-center justify-center rounded-md ${
                            toolOptions.strokeWidth === width ? "bg-white/10" : "hover:bg-white/5"
                          }`}
                        >
                          <div
                            className="rounded-full bg-white"
                            style={{ width: width * 1.3, height: width * 1.3 }}
                          />
                        </button>
                      ))}
                    </div>

                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Fill
                    </div>
                    <button
                      onClick={() => {
                        const newFill = toolOptions.fillColor ? null : toolOptions.strokeColor;
                        setToolOptions({ fillColor: newFill });
                        if (selectedLayerId && selectedIsShape) {
                          const s = selectedItem as AnnotationShape;
                          if (s.type === "rectangle" || s.type === "circle") {
                            updateAnnotation(selectedLayerId, { fill: newFill });
                          }
                        }
                      }}
                      className={`w-full rounded-xl px-3 py-1.5 text-left text-xs transition-colors ${
                        toolOptions.fillColor ? "bg-white/10 text-text-1" : "text-text-2 hover:bg-white/5"
                      }`}
                    >
                      {toolOptions.fillColor ? "Fill on" : "Fill off"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Text options: color, size, font */}
            {(currentTool === "text" || selectedIsText) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setSizeDropdownOpen((o) => !o);
                    setShapesDropdownOpen(false);
                    setShapeOptionsDropdownOpen(false);
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-[11px] transition-colors ${
                    sizeDropdownOpen ? "bg-white/10 text-text-1" : "text-icon-2 hover:bg-white/5"
                  }`}
                  title="Text options"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                {sizeDropdownOpen && (
                  <div className="absolute left-full top-0 ml-2 z-[130] min-w-[190px] rounded-2xl border border-border-transparent-secondary bg-background-transparent-black p-3 shadow-xl f-effect-backdrop-blur-lg">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Color
                    </div>
                    <div className="mb-3 grid grid-cols-4 gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setToolOptions({ strokeColor: color });
                            if (selectedLayerId && selectedIsText) {
                              updateAnnotation(selectedLayerId, { fill: color });
                            }
                          }}
                          className={`h-7 w-7 rounded-full transition-transform ${
                            toolOptions.strokeColor === color
                              ? "ring-2 ring-white ring-offset-2 ring-offset-black/40 scale-110"
                              : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Size
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1">
                      {FONT_SIZES.map((px) => (
                        <button
                          key={px}
                          onClick={() => {
                            setToolOptions({ fontSize: px });
                            if (selectedLayerId && selectedIsText) {
                              updateAnnotation(selectedLayerId, { fontSize: px });
                            }
                          }}
                          className={`rounded px-2 py-1 text-xs transition-colors ${
                            toolOptions.fontSize === px
                              ? "bg-white/10 text-text-1"
                              : "text-text-2 hover:bg-white/5"
                          }`}
                        >
                          {px}
                        </button>
                      ))}
                    </div>

                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-3">
                      Font
                    </div>
                    <select
                      value={toolOptions.fontFamily}
                      onChange={(e) => {
                        const font = e.target.value;
                        setToolOptions({ fontFamily: font });
                        if (selectedLayerId && selectedIsText) {
                          updateAnnotation(selectedLayerId, { fontFamily: font });
                        }
                      }}
                      className="w-full rounded-xl border border-border-transparent bg-black/40 px-2 py-1.5 text-xs text-text-2"
                    >
                      {FONT_FAMILIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
      </aside>

      {/* Centered canvas (no header, no card background) */}
      <div className="relative flex items-center justify-center w-[1180px] h-[760px]">
        <div ref={containerRef} className="flex items-center justify-center">
          <div
            className="relative alpha-checker-pattern rounded-2xl"
            style={{ width: stageSize.width, height: stageSize.height }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_0_0_2px_rgba(255,255,255,0.5)]" />
            <Stage
              ref={stageRef}
              width={stageSize.width}
              height={stageSize.height}
              scaleX={scale}
              scaleY={scale}
              x={position.x}
              y={position.y}
              draggable={false}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={stageSize.width}
                  height={stageSize.height}
                  fill="#1a1a1a"
                  listening={currentTool === "select"}
                  draggable={currentTool === "select"}
                  dragBoundFunc={() => ({ x: 0, y: 0 })}
                  onDragMove={(e) => {
                    const node = e.target;
                    setPosition((p) => ({ x: p.x + node.x(), y: p.y + node.y() }));
                    node.position({ x: 0, y: 0 });
                  }}
                  id="pan-background"
                />
                {unifiedLayers.filter(isLayerVisible).map((item) => {
                  if (isImageLayer(item)) {
                    const img = imageCache[item.url];
                    if (!img) return null;
                    const canEdit = currentTool === "select" && !isLayerLocked(item);
                    return (
                      <Group
                        key={item.id}
                        id={item.id}
                        x={item.x}
                        y={item.y}
                        scaleX={item.scaleX}
                        scaleY={item.scaleY}
                        globalCompositeOperation={item.blendMode ?? "source-over"}
                        listening={canEdit}
                        draggable={canEdit}
                        dragBoundFunc={
                          canEdit
                            ? (pos: { x: number; y: number }) => ({
                                x: snapToGuides(pos.x, "x"),
                                y: snapToGuides(pos.y, "y"),
                              })
                            : undefined
                        }
                        onDragEnd={(e) => {
                          const node = e.target;
                          const newX = snapToGuides(node.x(), "x");
                          const newY = snapToGuides(node.y(), "y");
                          updateImageLayer(item.id, { x: newX, y: newY });
                        }}
                        onClick={() => canEdit && selectLayer(item.id)}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          updateImageLayer(item.id, {
                            x: node.x(),
                            y: node.y(),
                            scaleX: node.scaleX(),
                            scaleY: node.scaleY(),
                          });
                        }}
                      >
                        <KonvaImage image={img} width={stageSize.width} height={stageSize.height} listening={canEdit} />
                      </Group>
                    );
                  }
                  return renderShape(item);
                })}
                {currentShape && renderShape(currentShape, true)}
                <Transformer ref={transformerRef} shouldOverdrawWholeArea={false} />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      {layerContextMenu && (
        <div
          className="fixed z-[120] bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
        >
          <button
            onClick={() => {
              const item = unifiedLayers[layerContextMenu.index];
              if (item) duplicateLayer(item.id);
              setLayerContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700"
          >
            Duplicate
          </button>
          <button
            onClick={() => {
              const item = unifiedLayers[layerContextMenu.index];
              if (item) copyLayers([item.id]);
              setLayerContextMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700"
          >
            Copy
          </button>
          <button
            onClick={() => {
              pasteLayers();
              setLayerContextMenu(null);
            }}
            disabled={clipboard.length === 0}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Paste
          </button>
          <div className="h-px bg-neutral-600 my-1" />
          <button
            onClick={() => {
              reorderLayer(layerContextMenu.index, "front");
              setLayerContextMenu(null);
            }}
            disabled={layerContextMenu.index === unifiedLayers.length - 1}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Bring to Front
          </button>
          <button
            onClick={() => {
              reorderLayer(layerContextMenu.index, "forward");
              setLayerContextMenu(null);
            }}
            disabled={layerContextMenu.index === unifiedLayers.length - 1}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Bring Forward
          </button>
          <button
            onClick={() => {
              reorderLayer(layerContextMenu.index, "backward");
              setLayerContextMenu(null);
            }}
            disabled={layerContextMenu.index === 0}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send Backward
          </button>
          <button
            onClick={() => {
              reorderLayer(layerContextMenu.index, "back");
              setLayerContextMenu(null);
            }}
            disabled={layerContextMenu.index === 0}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send to Back
          </button>
        </div>
      )}

      {/* Inline Text Input */}
      {editingTextId && textInputPosition && (
        <input
          ref={textInputRef}
          type="text"
          autoFocus
          defaultValue={editingTextId === "new" ? "" : (unifiedLayers.find((a) => !isImageLayer(a) && a.id === editingTextId) as TextShape)?.text || ""}
          className="fixed z-[110] bg-transparent border-none outline-none"
          style={{
            left: textInputPosition!.x,
            top: textInputPosition!.y,
            fontSize: `${(editingTextId === "new" ? toolOptions.fontSize : (unifiedLayers.find((a) => !isImageLayer(a) && a.id === editingTextId) as TextShape)?.fontSize ?? toolOptions.fontSize) * scale}px`,
            fontFamily: editingTextId === "new" ? toolOptions.fontFamily : ((unifiedLayers.find((a) => !isImageLayer(a) && a.id === editingTextId) as TextShape)?.fontFamily ?? toolOptions.fontFamily),
            color: editingTextId === "new" ? toolOptions.strokeColor : ((unifiedLayers.find((a) => !isImageLayer(a) && a.id === editingTextId) as TextShape)?.fill || toolOptions.strokeColor),
            minWidth: "100px",
            caretColor: "white",
          }}
          onKeyDown={(e) => {
            if (!editingTextId) return;

            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value;
              if (value.trim()) {
                if (editingTextId === "new" && pendingTextPosition) {
                  // Create new text annotation
                  const newShape: TextShape = {
                    id: `shape-${Date.now()}`,
                    type: "text",
                    x: pendingTextPosition.x,
                    y: pendingTextPosition.y,
                    text: value,
                    fontSize: toolOptions.fontSize,
                    fontFamily: toolOptions.fontFamily,
                    fill: toolOptions.strokeColor,
                    stroke: toolOptions.strokeColor,
                    strokeWidth: toolOptions.strokeWidth,
                    opacity: toolOptions.opacity,
                  };
                  addAnnotation(newShape);
                } else {
                  updateAnnotation(editingTextId, { text: value });
                }
              } else if (editingTextId !== "new") {
                deleteLayer(editingTextId!);
              }
              setEditingTextId(null);
              setTextInputPosition(null);
              setPendingTextPosition(null);
            }
            if (e.key === "Escape") {
              if (editingTextId !== "new") {
                const currentText = (unifiedLayers.find((a) => !isImageLayer(a) && a.id === editingTextId) as TextShape)?.text;
                if (!currentText) {
                  deleteLayer(editingTextId);
                }
              }
              setEditingTextId(null);
              setTextInputPosition(null);
              setPendingTextPosition(null);
            }
          }}
          onBlur={(e) => {
            // Ignore blur events that happen immediately after creation (within 200ms)
            // This prevents the click that created the input from also triggering blur
            if (Date.now() - textInputCreatedAt.current < 200) {
              e.target.focus();
              return;
            }

            if (!editingTextId) return;

            const value = e.target.value;
            if (value.trim()) {
              if (editingTextId === "new" && pendingTextPosition) {
                // Create new text annotation
                const newShape: TextShape = {
                  id: `shape-${Date.now()}`,
                  type: "text",
                  x: pendingTextPosition.x,
                  y: pendingTextPosition.y,
                  text: value,
                  fontSize: toolOptions.fontSize,
                  fontFamily: toolOptions.fontFamily,
                  fill: toolOptions.strokeColor,
                  stroke: toolOptions.strokeColor,
                  strokeWidth: toolOptions.strokeWidth,
                  opacity: toolOptions.opacity,
                };
                addAnnotation(newShape);
              } else {
                updateAnnotation(editingTextId!, { text: value });
              }
            } else if (editingTextId !== "new") {
              deleteLayer(editingTextId!);
            }
            setEditingTextId(null);
            setTextInputPosition(null);
            setPendingTextPosition(null);
          }}
        />
      )}
    </div>
  );
}
