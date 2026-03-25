"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
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

function LightCone({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const dir = useMemo(() => to.clone().sub(from), [from, to]);
  const length = dir.length();
  const midpoint = useMemo(() => from.clone().add(to).multiplyScalar(0.5), [from, to]);
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return q;
  }, [dir]);

  return (
    <mesh position={midpoint} quaternion={quat}>
      <coneGeometry args={[0.26, Math.max(0.2, length), 24, 1, true]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

const ORBIT_RADIUS = 2.1;
const SPHERE_SIZE = 0.18;

const getHorizontalPosition = (theta: number, radius: number): THREE.Vector3 => {
  const rad = theta * (Math.PI / 180);
  return new THREE.Vector3(radius * Math.sin(rad), 0, radius * Math.cos(rad));
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
  const dragSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), ORBIT_RADIUS));
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
          const hit = raycaster.ray.intersectSphere(dragSphere.current, new THREE.Vector3()) ?? intersectPoint.current;
          const rotationDeg = Math.atan2(hit.x, hit.z) * (180 / Math.PI);
          const normalizedY = Math.max(-1, Math.min(1, hit.y / ORBIT_RADIUS));
          const tiltDeg = Math.max(-85, Math.min(85, Math.asin(normalizedY) * (180 / Math.PI)));

          const rotRad = rotationDeg * (Math.PI / 180);
          const tiltRad = tiltDeg * (Math.PI / 180);
          newPos = new THREE.Vector3(
            ORBIT_RADIUS * Math.cos(tiltRad) * Math.sin(rotRad),
            ORBIT_RADIUS * Math.sin(tiltRad),
            ORBIT_RADIUS * Math.cos(tiltRad) * Math.cos(rotRad)
          );

          degrees = rotationDeg;
          liveAngles.current.rotation = rotationDeg;
          liveAngles.current.tilt = tiltDeg;
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
      const rotRad = currentRotation * (Math.PI / 180);
      const tiltRad = currentTilt * (Math.PI / 180);
      meshRef.current.position.set(
        ORBIT_RADIUS * Math.cos(tiltRad) * Math.sin(rotRad),
        ORBIT_RADIUS * Math.sin(tiltRad),
        ORBIT_RADIUS * Math.cos(tiltRad) * Math.cos(rotRad)
      );
    } else {
      const rad = currentTilt * (Math.PI / 180);
      meshRef.current.position.set(0, ORBIT_RADIUS * Math.sin(rad), ORBIT_RADIUS * Math.cos(rad));
    }
    if (wasDragging.current) {
      wasDragging.current = false;
      if (type === "rotation") {
        onDragEnd("rotation", Math.round(liveAngles.current.rotation));
        onDragEnd("tilt", Math.round(liveAngles.current.tilt));
      } else {
        onDragEnd(type, Math.round(currentAngle.current));
      }
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

  const horizontalSpherePos = useMemo(() => getHorizontalPosition(rotation, ORBIT_RADIUS), [rotation]);
  const onDragEnd = useCallback(
    (type: "rotation" | "tilt", angle: number) => {
      if (type === "rotation") onRotationChange(angle);
      else onTiltChange(angle);
    },
    [onRotationChange, onTiltChange]
  );

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[0.5, 2.8, 1.8]} intensity={0.7} />
      <mesh>
        <sphereGeometry args={[2.35, 40, 40]} />
        <meshStandardMaterial color="#8a8a8a" transparent opacity={0.26} />
      </mesh>

      <mesh position={[0, 0, 0]}>
        <circleGeometry args={[2.34, 80]} />
        <meshBasicMaterial color="#767676" transparent opacity={0.2} />
      </mesh>

      <ImagePlane imageUrl={imageUrl} />

      <LightCone from={horizontalSpherePos} to={new THREE.Vector3(0, 0.5, 0)} />

      <DraggableSphere
        position={horizontalSpherePos}
        color="#050505"
        type="rotation"
        liveAngles={liveAngles}
        onDragEnd={onDragEnd}
        isDragging={dragging === "rotation"}
        setDragging={setDragging}
      />
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

