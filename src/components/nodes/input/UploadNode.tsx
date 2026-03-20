"use client";

import { useCallback, useRef, useState, useEffect, Suspense } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { useToast } from "@/components/Toast";
import { useAudioVisualization } from "@/hooks/useAudioVisualization";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useMediaViewer } from "@/providers/media-viewer";
import { collectMediaItems } from "@/lib/media-collector";
import { MediaInputNodeData, type MediaInputMode } from "@/types";
import { calculateNodeSizeForFullBleed, getVideoDimensions, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { NodeVideoPlayer } from "../shared/NodeVideoPlayer";
import { UploadToolbar } from "./UploadToolbar";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type MediaInputNodeType = Node<MediaInputNodeData, "mediaInput">;

// --- 3D Viewer helpers (from GLBViewerNode) ---
function GLBModel({ url, onError }: { url: string; onError?: () => void }) {
  const sceneRef = useRef<THREE.Group | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { camera } = useThree();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const loadedScene = gltf.scene;
        const box = new THREE.Box3().setFromObject(loadedScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 2 / maxDim;
          loadedScene.scale.setScalar(scale);
          loadedScene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        }
        sceneRef.current = loadedScene;
        setLoaded(true);
        camera.position.set(3.5, 2.1, 3.5);
        camera.lookAt(0, 0, 0);
      },
      undefined,
      (error) => {
        if (!cancelled) {
          console.warn("GLB load failed:", error);
          onError?.();
        }
      }
    );
    return () => {
      cancelled = true;
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material?.dispose();
          }
        });
        sceneRef.current = null;
      }
    };
  }, [url, camera, onError]);

  if (!loaded || !sceneRef.current) return null;
  return <primitive object={sceneRef.current} />;
}

function GLBCaptureHelper({
  captureRef,
}: {
  captureRef: React.MutableRefObject<(() => string | null) | null>;
}) {
  const { gl, scene, camera } = useThree();
  useFrame(() => {
    captureRef.current = () => {
      try {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    };
  });
  return null;
}

function GLBAutoRotate({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    if (!enabled) return;
    const angle = delta * 0.3;
    const pos = camera.position.clone();
    camera.position.x = pos.x * Math.cos(angle) - pos.z * Math.sin(angle);
    camera.position.z = pos.x * Math.sin(angle) + pos.z * Math.cos(angle);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function MediaInputNode({ id, data, selected }: NodeProps<MediaInputNodeType>) {
  const nodeData = data as MediaInputNodeData;
  // Mode derived from content - no toggle bar
  const mode: MediaInputMode = nodeData.image
    ? "image"
    : nodeData.audioFile
      ? "audio"
      : nodeData.videoFile
        ? "video"
        : nodeData.glbUrl
          ? "3d"
          : "image";
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const { getNode, updateNode } = useReactFlow();
  const getNodes = useReactFlow().getNodes;
  const { openViewer } = useMediaViewer();
  const [autoRotate, setAutoRotate] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const glbCaptureRef = useRef<(() => string | null) | null>(null);
  const glbViewportRef = useRef<HTMLDivElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Revoke GLB blob URL on unmount or change
  useEffect(() => {
    const url = nodeData.glbUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [nodeData.glbUrl]);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  useEffect(() => {
    if (mode === "audio" && nodeData.audioFile) {
      fetch(nodeData.audioFile)
        .then((r) => r.blob())
        .then(setAudioBlob)
        .catch(() => setAudioBlob(null));
    } else {
      setAudioBlob(null);
    }
  }, [mode, nodeData.audioFile]);

  const { waveformData, isLoading } = useAudioVisualization(audioBlob);
  const {
    audioRef,
    canvasRef,
    waveformContainerRef,
    isPlaying,
    currentTime,
    handlePlayPause,
    handleSeek,
    formatTime,
  } = useAudioPlayback({
    audioSrc: mode === "audio" ? nodeData.audioFile ?? null : null,
    waveformData,
    isLoadingWaveform: isLoading,
  });

  // Resize for video aspect ratio (like GenerateVideoNode)
  useEffect(() => {
    if (mode !== "video" || !nodeData.videoFile) return;
    getVideoDimensions(nodeData.videoFile).then((dims) => {
      if (!dims) return;
      const node = getNode(id);
      if (!node) return;
      const aspectRatio = dims.width / dims.height;
      const currentHeight = (node.height as number) ?? (node.style?.height as number) ?? SQUARE_SIZE;
      const { width, height } = calculateNodeSizeForFullBleed(aspectRatio, currentHeight);
      const currentWidth = (node.width as number) ?? (node.style?.width as number) ?? SQUARE_SIZE;
      if (Math.abs(currentWidth - width) > 5 || Math.abs(currentHeight - height) > 5) {
        updateNode(id, {
          width,
          height,
          style: { ...node.style, width: `${width}px`, height: `${height}px` },
        });
      }
    });
  }, [id, mode, nodeData.videoFile, getNode, updateNode]);

  // Resize for image aspect ratio
  useEffect(() => {
    if (mode !== "image") return;
    const node = getNode(id);
    if (!node) return;
    const dims = nodeData.dimensions;
    if (!dims || dims.width <= 0 || dims.height <= 0) {
      if (!nodeData.image) {
        const defaultWidth = SQUARE_SIZE;
        const defaultHeight = SQUARE_SIZE;
        const currentWidth = (node.width as number) ?? (node.style?.width as number);
        const currentHeight = (node.height as number) ?? (node.style?.height as number);
        if (currentWidth !== defaultWidth || currentHeight !== defaultHeight) {
          updateNode(id, {
            width: defaultWidth,
            height: defaultHeight,
            style: { ...node.style, width: `${defaultWidth}px`, height: `${defaultHeight}px` },
          });
        }
      }
      return;
    }
    const aspectRatio = dims.width / dims.height;
    const currentHeight = (node.height as number) ?? (node.style?.height as number) ?? SQUARE_SIZE;
    const { width, height } = calculateNodeSizeForFullBleed(aspectRatio, currentHeight);
    const currentWidth = (node.width as number) ?? (node.style?.width as number) ?? SQUARE_SIZE;
    if (Math.abs(currentWidth - width) > 5 || Math.abs(currentHeight - height) > 5) {
      updateNode(id, {
        width,
        height,
        style: { ...node.style, width: `${width}px`, height: `${height}px` },
      });
    }
  }, [id, mode, nodeData.dimensions, nodeData.image, getNode, updateNode]);

  // GLB viewport wheel
  useEffect(() => {
    const el = glbViewportRef.current;
    if (!el || mode !== "3d") return;
    const stopWheel = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener("wheel", stopWheel, { passive: false });
    return () => el.removeEventListener("wheel", stopWheel);
  }, [mode]);

  const aspectFitMedia =
    mode === "image" ? nodeData.image : mode === "video" ? nodeData.videoFile : mode === "3d" ? nodeData.capturedImage : null;

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.match(/^image\/(png|jpeg|webp)$/)) {
        if (file) alert("Unsupported format. Use PNG, JPG, or WebP.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large. Maximum size is 10MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          updateNodeData(id, {
            mode: "image",
            image: base64,
            imageRef: undefined,
            filename: file.name,
            dimensions: { width: img.width, height: img.height },
          });
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [id, updateNodeData]
  );

  const handleVideoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.match(/^video\//)) {
        if (file) alert("Unsupported format. Use MP4, WebM, or other video.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        alert("Video too large. Maximum size is 100MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        updateNodeData(id, {
          mode: "video",
          videoFile: base64,
          filename: file.name,
        });
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [id, updateNodeData]
  );

  const handleAudioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.match(/^audio\//)) {
        if (file) alert("Unsupported format. Use MP3, WAV, OGG, or other audio.");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert("Audio too large. Maximum size is 50MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const audio = new Audio(base64);
        audio.onloadedmetadata = () => {
          updateNodeData(id, {
            mode: "audio",
            audioFile: base64,
            filename: file.name,
            format: file.type,
            duration: audio.duration,
          });
        };
        audio.onerror = () => {
          updateNodeData(id, {
            mode: "audio",
            audioFile: base64,
            filename: file.name,
            format: file.type,
            duration: null,
          });
        };
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [id, updateNodeData]
  );

  const processGLB = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".glb")) {
        useToast.getState().show("Please upload a .GLB file", "warning");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        useToast.getState().show("File too large. Maximum size is 100MB", "warning");
        return;
      }
      if (nodeData.glbUrl) URL.revokeObjectURL(nodeData.glbUrl);
      const url = URL.createObjectURL(file);
      updateNodeData(id, {
        mode: "3d",
        glbUrl: url,
        filename: file.name,
        capturedImage: null,
      });
    },
    [id, nodeData.glbUrl, updateNodeData]
  );

  const routeFile = useCallback(
    (file: File) => {
      if (file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
        const dt = new DataTransfer();
        dt.items.add(file);
        imageInputRef.current!.files = dt.files;
        imageInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (file.type.match(/^audio\//)) {
        const dt = new DataTransfer();
        dt.items.add(file);
        audioInputRef.current!.files = dt.files;
        audioInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (file.type.match(/^video\//)) {
        const dt = new DataTransfer();
        dt.items.add(file);
        videoInputRef.current!.files = dt.files;
        videoInputRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (file.name.toLowerCase().endsWith(".glb")) {
        processGLB(file);
      }
    },
    [processGLB]
  );

  const handleUnifiedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) routeFile(file);
      e.target.value = "";
    },
    [routeFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (file) routeFile(file);
    },
    [routeFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGLBCapture = useCallback(() => {
    if (glbCaptureRef.current) {
      const base64 = glbCaptureRef.current();
      if (base64) updateNodeData(id, { capturedImage: base64 });
      else useToast.getState().show("Failed to capture 3D view", "error");
    }
  }, [id, updateNodeData]);

  const handleGLError = useCallback(() => {
    updateNodeData(id, { glbUrl: null, filename: null, capturedImage: null });
  }, [id, updateNodeData]);

  const handleReplace = useCallback(() => {
    if (mode === "image") imageInputRef.current?.click();
    else if (mode === "video") videoInputRef.current?.click();
    else if (mode === "audio") audioInputRef.current?.click();
    else if (mode === "3d") glbInputRef.current?.click();
  }, [mode]);

  const handleFullscreen = useCallback(() => {
    const url = mode === "image" ? nodeData.image : mode === "video" ? nodeData.videoFile : null;
    if (!url) return;
    const items = collectMediaItems(getNodes());
    const index = items.findIndex((item) => item.url === url && item.nodeId === id);
    openViewer(items, index >= 0 ? index : 0);
  }, [getNodes, id, mode, nodeData.image, nodeData.videoFile, openViewer]);

  const hasContent = !!(nodeData.image || nodeData.audioFile || nodeData.videoFile || nodeData.glbUrl);
  const getOutputHandle = () => {
    if (mode === "image") return { id: "image", type: "image" as const };
    if (mode === "audio") return { id: "audio", type: "audio" as const };
    if (mode === "video") return { id: "video", type: "video" as const };
    return { id: "image", type: "image" as const }; // 3d outputs captured image
  };
  const outputHandle = getOutputHandle();

  return (
    <>
      {hasContent && (mode === "image" || mode === "video") && (
        <UploadToolbar
          nodeId={id}
          hasImage={mode === "image" ? !!nodeData.image : !!nodeData.videoFile}
          onReplaceClick={handleReplace}
          onDownloadClick={undefined}
          onFullscreenClick={handleFullscreen}
          mode={mode === "video" ? "video" : "image"}
          videoPreviewRef={videoPreviewRef}
          videoSourceUrl={mode === "video" ? nodeData.videoFile ?? null : null}
        />
      )}
      <BaseNode
      id={id}
      selected={selected}
      fullBleed
      contentClassName="flex-1 min-h-0 overflow-clip flex flex-col"
      aspectFitMedia={aspectFitMedia}
      minWidth={250}
      minHeight={mode === "3d" ? 200 : mode === "video" ? 200 : 150}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleImageChange}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioChange}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoChange}
        className="hidden"
      />
      <input
        ref={glbInputRef}
        type="file"
        accept=".glb"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processGLB(file);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={unifiedInputRef}
        type="file"
        accept="image/*,audio/*,video/*,.glb"
        onChange={handleUnifiedChange}
        className="hidden"
      />

      {/* Unified empty state */}
      {!hasContent && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => unifiedInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              unifiedInputRef.current?.click();
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="flex-1 min-h-[120px] bg-neutral-900/40 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-900/60 transition-colors"
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">Drop image, audio, video or 3D or click</span>
        </div>
      )}

      {/* Image mode */}
      {hasContent && mode === "image" && (
        <>
          {nodeData.image ? (
            <div className="relative group flex-1 min-h-0 min-w-0 overflow-hidden">
              <img
                src={nodeData.image}
                alt={nodeData.filename || "Uploaded image"}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
        </>
      )}

      {/* Video mode */}
      {hasContent && mode === "video" && (
        <>
          {nodeData.videoFile ? (
            <div className="relative group flex-1 min-h-0 flex flex-col min-w-0">
              <NodeVideoPlayer
                src={nodeData.videoFile}
                videoKey={nodeData.videoFile}
                autoPlay={false}
                loop={true}
                muted={true}
                objectFit="cover"
                compact
                forwardedVideoRef={videoPreviewRef}
              />
            </div>
          ) : null}
        </>
      )}

      {/* Audio mode — waveform fills node; centered play/pause; duration at bottom-right inside node */}
      {hasContent && mode === "audio" && (
        <>
          {nodeData.audioFile ? (
            <div className="relative group flex-1 flex flex-col min-h-0">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center bg-neutral-900/50 min-h-[60px]">
                  <span className="text-xs text-neutral-500">Loading waveform...</span>
                </div>
              ) : waveformData ? (
                <div
                  ref={waveformContainerRef}
                  className="flex-1 min-h-[60px] bg-neutral-900/50 cursor-pointer relative nodrag nopan"
                  onClick={handleSeek}
                >
                  <canvas ref={canvasRef} className="w-full h-full" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPause();
                      }}
                      className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-white/25 hover:bg-white/40 rounded-full transition-colors nodrag nopan"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-neutral-900/50 min-h-[60px]">
                  <span className="text-xs text-neutral-500">Processing...</span>
                </div>
              )}
              {/* Duration at bottom-right; transparent so node background shows (same as node) */}
              {nodeData.duration != null && (
                <div className="flex justify-end shrink-0 pt-0.5 pr-2 bg-transparent">
                  <span className="text-[10px] text-neutral-400 nodrag nopan">
                    {formatTime(nodeData.duration)}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* 3D mode */}
      {hasContent && mode === "3d" && (
        <>
          {nodeData.glbUrl ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div
                ref={glbViewportRef}
                className="nodrag nopan nowheel relative w-full flex-1 min-h-[200px] overflow-hidden bg-neutral-900 rounded"
                onPointerDown={() => setIsInteracting(true)}
                onPointerUp={() => setIsInteracting(false)}
              >
                <Canvas
                  resize={{ offsetSize: true }}
                  gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
                  camera={{ position: [3.5, 2.1, 3.5], fov: 45, near: 0.01, far: 100 }}
                  onCreated={({ gl }) => {
                    gl.setClearColor(new THREE.Color("#1a1a1a"));
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.2;
                  }}
                >
                  <ambientLight intensity={0.5} />
                  <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
                  <directionalLight position={[-3, 2, -2]} intensity={0.3} />
                  <hemisphereLight args={["#b1e1ff", "#444444", 0.4]} />
                  <Suspense
                    fallback={
                      <mesh>
                        <sphereGeometry args={[0.2, 16, 16]} />
                        <meshBasicMaterial color="#666" wireframe />
                      </mesh>
                    }
                  >
                    <GLBModel url={nodeData.glbUrl} onError={handleGLError} />
                  </Suspense>
                  <OrbitControls makeDefault enableDamping dampingFactor={0.1} enablePan enableZoom target={[0, 0, 0]} />
                  <GLBAutoRotate enabled={autoRotate && !isInteracting} />
                  <GLBCaptureHelper captureRef={glbCaptureRef} />
                </Canvas>
                <div className="absolute top-0 left-0 z-10 px-2 py-1.5 flex items-center gap-1.5 pointer-events-none bg-neutral-800/80 rounded-br">
                  <div className="flex items-center gap-1 pointer-events-auto">
                    <button
                      onClick={() => setAutoRotate(!autoRotate)}
                      title={autoRotate ? "Stop auto-rotate" : "Auto-rotate"}
                      className={`p-0.5 rounded transition-colors nodrag nopan ${
                        autoRotate ? "text-cyan-400 bg-cyan-400/10" : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                    </button>
                    <button
                      onClick={handleGLBCapture}
                      title="Capture view as image"
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300 hover:text-neutral-100 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors nodrag nopan"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      </svg>
                      Capture
                    </button>
                  </div>
                </div>
              </div>
              {nodeData.capturedImage && (
                <div className="px-3 py-1.5 shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Captured
                    </span>
                    <button
                      onClick={() => updateNodeData(id, { capturedImage: null })}
                      className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors nodrag nopan"
                    >
                      Clear
                    </button>
                  </div>
                  <img
                    src={nodeData.capturedImage}
                    alt="Captured 3D render"
                    className="w-full rounded border border-neutral-700 bg-neutral-900"
                  />
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </BaseNode>

      {/* Handles rendered outside overflow-hidden so they stay connectable after Replace */}
      {mode === "image" && (
        <Handle type="target" position={Position.Left} id="reference" data-handletype="reference" className="!bg-gray-500" />
      )}
      {mode === "audio" && (
        <Handle type="target" position={Position.Left} id="audio" data-handletype="audio" style={{ background: "rgba(255, 255, 255, 0.9)" }} />
      )}
      {mode === "3d" && (
        <Handle type="target" position={Position.Left} id="3d" data-handletype="3d" style={{ top: "50%" }} />
      )}
      <Handle
        type="source"
        position={Position.Right}
        id={outputHandle.id}
        data-handletype={outputHandle.type}
        style={
          outputHandle.type === "audio"
            ? { background: "rgb(167, 139, 250)" }
            : outputHandle.type === "video"
              ? { background: "rgb(251, 191, 36)" }
              : outputHandle.type === "image"
                ? { background: "#e5e5e5" }
                : undefined
        }
      />
    </>
  );
}
