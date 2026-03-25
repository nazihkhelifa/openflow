"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Line, Sphere, Box } from "@react-three/drei";
import * as THREE from "three";

interface OrbitCameraControlProps {
  imageUrl: string | null;
  rotation: number;
  tilt: number;
  onRotationChange: (value: number) => void;
  onTiltChange: (value: number) => void;
}

interface SceneProps extends OrbitCameraControlProps {}

interface LiveAnglesRef {
  rotation: number;
  tilt: number;
}

const ORBIT_RADIUS = 2.5;
const SPHERE_SIZE = 0.18;

const generateHorizontalArcPoints = (radius: number, segments = 64): THREE.Vector3[] => {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI - Math.PI / 2;
    points.push(new THREE.Vector3(radius * Math.sin(theta), 0, radius * Math.cos(theta)));
  }
  return points;
};

const generateVerticalArcPoints = (radius: number, segments = 32): THREE.Vector3[] => {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const phi = ((i / segments) * 135 - 45) * (Math.PI / 180);
    points.push(new THREE.Vector3(0, radius * Math.sin(phi), radius * Math.cos(phi)));
  }
  return points;
};

const getHorizontalPosition = (theta: number, radius: number): THREE.Vector3 => {
  const rad = theta * (Math.PI / 180);
  return new THREE.Vector3(radius * Math.sin(rad), 0, radius * Math.cos(rad));
};

const getVerticalPosition = (phi: number, radius: number): THREE.Vector3 => {
  const rad = phi * (Math.PI / 180);
  return new THREE.Vector3(0, radius * Math.sin(rad), radius * Math.cos(rad));
};

function ImagePlane({ imageUrl }: { imageUrl: string | null }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setTexture(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
      imageUrl,
      (loaded) => {
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = false;
        loaded.colorSpace = THREE.SRGBColorSpace;
        setTexture(loaded);
      },
      undefined,
      () => setTexture(null)
    );
    return () => {
      texture?.dispose();
    };
  }, [imageUrl]);

  return (
    <group position={[0, 0.5, 0]}>
      <mesh>
        <planeGeometry args={[0.8, 1.0]} />
        {texture ? <meshBasicMaterial map={texture} /> : <meshStandardMaterial color="#1a1a1a" />}
      </mesh>
    </group>
  );
}

interface DraggableSphereProps {
  position: THREE.Vector3;
  color: string;
  type: "rotation" | "tilt";
  liveAngles: React.MutableRefObject<LiveAnglesRef>;
  onDragEnd: (type: "rotation" | "tilt", angle: number) => void;
  isDragging: boolean;
  setDragging: (type: "rotation" | "tilt" | null) => void;
}

function DraggableSphere({
  position,
  color,
  type,
  liveAngles,
  onDragEnd,
  isDragging,
  setDragging,
}: DraggableSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl, raycaster, pointer } = useThree();
  const planeRef = useRef(new THREE.Plane());
  const intersectPoint = useRef(new THREE.Vector3());
  const currentAngle = useRef<number>(0);
  const wasDragging = useRef<boolean>(false);

  useEffect(() => {
    currentAngle.current =
      type === "rotation"
        ? Math.atan2(position.x, position.z) * (180 / Math.PI)
        : Math.atan2(position.y, position.z) * (180 / Math.PI);
  }, [position, type]);

  const handlePointerDown = useCallback(
    (e: unknown) => {
      const event = e as { stopPropagation: () => void };
      event.stopPropagation();
      setDragging(type);
      if (type === "rotation") {
        planeRef.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      } else {
        planeRef.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0));
      }
      (gl.domElement as HTMLElement).style.cursor = "grabbing";
    },
    [gl, setDragging, type]
  );

  useFrame(() => {
    if (!meshRef.current) return;
    if (isDragging) {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(planeRef.current, intersectPoint.current)) {
        let degrees = 0;
        let newPos = new THREE.Vector3();
        if (type === "rotation") {
          const angle = Math.atan2(intersectPoint.current.x, intersectPoint.current.z);
          degrees = Math.max(-90, Math.min(90, angle * (180 / Math.PI)));
          const rad = degrees * (Math.PI / 180);
          newPos = new THREE.Vector3(ORBIT_RADIUS * Math.sin(rad), 0, ORBIT_RADIUS * Math.cos(rad));
          liveAngles.current.rotation = degrees;
        } else {
          const angle = Math.atan2(intersectPoint.current.y, intersectPoint.current.z);
          degrees = Math.max(-45, Math.min(90, angle * (180 / Math.PI)));
          const rad = degrees * (Math.PI / 180);
          newPos = new THREE.Vector3(0, ORBIT_RADIUS * Math.sin(rad), ORBIT_RADIUS * Math.cos(rad));
          liveAngles.current.tilt = degrees;
        }
        currentAngle.current = degrees;
        meshRef.current.position.copy(newPos);
      }
      wasDragging.current = true;
      return;
    }

    const currentRotation = liveAngles.current.rotation;
    const currentTilt = liveAngles.current.tilt;
    if (type === "rotation") {
      const rad = currentRotation * (Math.PI / 180);
      meshRef.current.position.set(ORBIT_RADIUS * Math.sin(rad), 0, ORBIT_RADIUS * Math.cos(rad));
    } else {
      const rad = currentTilt * (Math.PI / 180);
      meshRef.current.position.set(0, ORBIT_RADIUS * Math.sin(rad), ORBIT_RADIUS * Math.cos(rad));
    }
    if (wasDragging.current) {
      wasDragging.current = false;
      onDragEnd(type, Math.round(currentAngle.current));
    }
  });

  return (
    <Sphere
      ref={meshRef}
      args={[isDragging ? SPHERE_SIZE * 1.2 : SPHERE_SIZE, 24, 24]}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerOver={() => ((gl.domElement as HTMLElement).style.cursor = "grab")}
      onPointerOut={() => {
        if (!isDragging) (gl.domElement as HTMLElement).style.cursor = "auto";
      }}
    >
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
    </Sphere>
  );
}

function CameraIndicator({ liveAngles }: { liveAngles: React.MutableRefObject<LiveAnglesRef> }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const rot = liveAngles.current.rotation * (Math.PI / 180);
    const tilt = liveAngles.current.tilt * (Math.PI / 180);
    const r = ORBIT_RADIUS * 0.7;
    const pos = new THREE.Vector3(
      r * Math.cos(tilt) * Math.sin(rot),
      r * Math.sin(tilt) + 0.5,
      r * Math.cos(tilt) * Math.cos(rot)
    );
    const matrix = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(0, 0.8, 0), new THREE.Vector3(0, 1, 0));
    const euler = new THREE.Euler().setFromRotationMatrix(matrix);
    groupRef.current.position.copy(pos);
    groupRef.current.rotation.copy(euler);
  });
  return (
    <group ref={groupRef}>
      <Box args={[0.35, 0.25, 0.2]}>
        <meshStandardMaterial color="#3f4a5c" />
      </Box>
      <Box args={[0.1, 0.16, 0.1]} position={[0, 0, -0.14]}>
        <meshStandardMaterial color="#202938" />
      </Box>
      <Sphere args={[0.11, 16, 16]} position={[0, 0, -0.22]}>
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.55} />
      </Sphere>
    </group>
  );
}

function Scene({ imageUrl, rotation, tilt, onRotationChange, onTiltChange }: SceneProps) {
  const [dragging, setDragging] = useState<"rotation" | "tilt" | null>(null);
  const { gl } = useThree();
  const liveAngles = useRef<LiveAnglesRef>({ rotation, tilt });
  const wasJustDragging = useRef(false);

  useEffect(() => {
    if (dragging) wasJustDragging.current = true;
  }, [dragging]);

  useEffect(() => {
    if (!dragging && !wasJustDragging.current) {
      liveAngles.current.rotation = rotation;
      liveAngles.current.tilt = tilt;
    }
    if (!dragging && wasJustDragging.current) wasJustDragging.current = false;
  }, [rotation, tilt, dragging]);

  useEffect(() => {
    const onPointerUp = () => {
      if (dragging) {
        setDragging(null);
        (gl.domElement as HTMLElement).style.cursor = "auto";
      }
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, [dragging, gl]);

  const horizontalArcPoints = useMemo(() => generateHorizontalArcPoints(ORBIT_RADIUS), []);
  const verticalArcPoints = useMemo(() => generateVerticalArcPoints(ORBIT_RADIUS), []);
  const horizontalSpherePos = useMemo(() => getHorizontalPosition(rotation, ORBIT_RADIUS), [rotation]);
  const verticalSpherePos = useMemo(() => getVerticalPosition(tilt, ORBIT_RADIUS), [tilt]);
  const onDragEnd = useCallback(
    (type: "rotation" | "tilt", angle: number) => {
      if (type === "rotation") onRotationChange(angle);
      else onTiltChange(angle);
    },
    [onRotationChange, onTiltChange]
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <pointLight position={[-3, 5, 3]} intensity={0.45} />

      <Grid
        args={[12, 12]}
        cellSize={0.25}
        cellThickness={0.3}
        cellColor="#3a4a5a"
        sectionSize={2}
        sectionThickness={0.5}
        sectionColor="#4a5a6a"
        fadeDistance={20}
        fadeStrength={1.5}
        position={[0, -0.01, 0]}
      />

      <Line points={horizontalArcPoints} color="#4ade80" lineWidth={4} />
      <Line points={verticalArcPoints} color="#ec4899" lineWidth={4} />

      <ImagePlane imageUrl={imageUrl} />

      <DraggableSphere
        position={horizontalSpherePos}
        color="#22d3ee"
        type="rotation"
        liveAngles={liveAngles}
        onDragEnd={onDragEnd}
        isDragging={dragging === "rotation"}
        setDragging={setDragging}
      />
      <DraggableSphere
        position={verticalSpherePos}
        color="#ec4899"
        type="tilt"
        liveAngles={liveAngles}
        onDragEnd={onDragEnd}
        isDragging={dragging === "tilt"}
        setDragging={setDragging}
      />
      <CameraIndicator liveAngles={liveAngles} />
    </>
  );
}

export function OrbitCameraControl({
  imageUrl,
  rotation,
  tilt,
  onRotationChange,
  onTiltChange,
}: OrbitCameraControlProps) {
  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#2B2B2B] p-2">
        <div className="nodrag nopan mx-auto h-[256px] w-[256px] overflow-hidden rounded-xl border border-neutral-700/70 bg-[#2B2B2B]">
          <Canvas camera={{ position: [3.5, 2.5, 4.5], fov: 55, near: 0.1, far: 100 }} gl={{ antialias: true }}>
            <color attach="background" args={["#2B2B2B"]} />
            <Scene
              imageUrl={imageUrl}
              rotation={rotation}
              tilt={tilt}
              onRotationChange={onRotationChange}
              onTiltChange={onTiltChange}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
}

