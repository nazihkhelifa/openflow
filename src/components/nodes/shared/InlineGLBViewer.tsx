"use client";

import React, { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Loads and renders a GLB model (same logic as GLBViewerNode).
 */
function Model({ url, onError }: { url: string; onError?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const sceneRef = useRef<THREE.Group | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { camera } = useThree();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    const loader = new GLTFLoader();
    try {
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
          const dist = 3.5;
          camera.position.set(dist, dist * 0.6, dist);
          camera.lookAt(0, 0, 0);
        },
        undefined,
        (error) => {
          if (cancelled) return;
          console.warn("GLB load failed:", error);
          onError?.();
        }
      );
    } catch {
      if (!cancelled) onError?.();
    }

    return () => {
      cancelled = true;
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            try {
              obj.geometry?.dispose();
            } catch (e) {
              console.warn("GLB geometry dispose failed:", e);
            }
            try {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material?.dispose();
              }
            } catch (e) {
              console.warn("GLB material dispose failed:", e);
            }
          }
        });
        sceneRef.current = null;
      }
    };
  }, [url, camera, onError]);

  if (!loaded || !sceneRef.current) return null;
  return (
    <group ref={groupRef}>
      <primitive object={sceneRef.current} />
    </group>
  );
}

/**
 * Environment (spotlight) — hidden during capture via ref, same as GLBViewerNode.
 */
function SceneEnvironment({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group ref={groupRef}>
      <spotLight
        position={[5, 8, 5]}
        angle={0.4}
        penumbra={0.8}
        intensity={1.5}
        castShadow
      />
    </group>
  );
}

/**
 * Exposes capture function to parent; hides env group during capture.
 */
function CaptureHelper({
  captureRef,
  envGroupRef,
}: {
  captureRef: React.MutableRefObject<(() => string | null) | null>;
  envGroupRef: React.RefObject<THREE.Group | null>;
}) {
  const { gl, scene, camera } = useThree();

  useFrame(() => {
    captureRef.current = () => {
      try {
        if (envGroupRef.current) envGroupRef.current.visible = false;
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL("image/png");
        if (envGroupRef.current) envGroupRef.current.visible = true;
        return dataUrl;
      } catch (err) {
        console.warn("GLB capture failed:", err);
        if (envGroupRef.current) envGroupRef.current.visible = true;
        return null;
      }
    };
  });

  return null;
}

function AutoRotate({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  useFrame((_, delta) => {
    if (!enabled) return;
    const angle = delta * 0.3;
    const pos = camera.position.clone();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    camera.position.x = pos.x * cos - pos.z * sin;
    camera.position.z = pos.x * sin + pos.z * cos;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function LoadingIndicator() {
  return (
    <mesh>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshBasicMaterial color="#666" wireframe />
    </mesh>
  );
}

export interface InlineGLBViewerProps {
  glbUrl: string;
  className?: string;
  minHeight?: number;
  onError?: () => void;
  /** Stop wheel events so zoom works inside the viewer instead of the canvas */
  stopWheel?: boolean;
  /** When provided, parent can call captureRef.current?.() to get PNG data URL (for Capture button) */
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
  /** Auto-rotate model when not interacting (controlled by parent; default false, same as GLB Viewer) */
  autoRotate?: boolean;
}

export function InlineGLBViewer({
  glbUrl,
  className = "",
  minHeight = 160,
  onError,
  stopWheel = true,
  captureRef,
  autoRotate = false,
}: InlineGLBViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const envGroupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!stopWheel || !containerRef.current) return;
    const el = containerRef.current;
    const stop = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, [stopWheel]);

  return (
    <div
      ref={containerRef}
      className={`nodrag nopan relative w-full overflow-hidden bg-neutral-900 rounded ${className}`}
      style={{ minHeight }}
      onPointerDown={(e) => {
        e.stopPropagation();
        setIsInteracting(true);
      }}
      onPointerUp={() => setIsInteracting(false)}
      onPointerLeave={() => setIsInteracting(false)}
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
        <SceneEnvironment groupRef={envGroupRef} />
        <Suspense fallback={<LoadingIndicator />}>
          <Model url={glbUrl} onError={onError} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          enablePan
          enableZoom
          target={[0, 0, 0]}
        />
        <AutoRotate enabled={autoRotate && !isInteracting} />
        {captureRef && <CaptureHelper captureRef={captureRef} envGroupRef={envGroupRef} />}
      </Canvas>
    </div>
  );
}
