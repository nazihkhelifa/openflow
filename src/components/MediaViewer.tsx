"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useMediaViewer } from "@/providers/media-viewer";
import type { MediaItem } from "@/lib/media-collector";

type BeforeAfterSliderProps = {
  beforeImage?: string;
  afterImage: string;
};

const BeforeAfterSlider = ({ beforeImage, afterImage }: BeforeAfterSliderProps) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isDragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  if (!beforeImage) {
    return (
      <Image
        src={afterImage}
        alt="Enhanced"
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw"
        className="object-contain rounded-[36px]"
        unoptimized
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-[36px] cursor-ew-resize"
      onClick={handleContainerClick}
    >
      <Image
        src={afterImage}
        alt="After"
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw"
        className="object-contain rounded-[36px]"
        unoptimized
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-[36px]"
        style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
      >
        <Image
          src={beforeImage}
          alt="Before"
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw"
          className="object-contain rounded-[36px]"
          unoptimized
        />
      </div>
      <div
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10 shadow-lg"
        style={{ left: `${sliderPosition}%`, transform: "translateX(-50%)" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown();
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-primary shadow-lg flex items-center justify-center">
          <div className="flex gap-0.5">
            <div className="w-0.5 h-3 bg-primary rounded-full" />
            <div className="w-0.5 h-3 bg-primary rounded-full" />
          </div>
        </div>
      </div>
      <div className="absolute top-4 left-4 px-3 py-1.5 rounded bg-black/60 text-white text-sm font-medium backdrop-blur-sm">
        Before
      </div>
      <div className="absolute top-4 right-4 px-3 py-1.5 rounded bg-black/60 text-white text-sm font-medium backdrop-blur-sm">
        After
      </div>
    </div>
  );
};

export const MediaViewer = () => {
  const { isOpen, closeViewer, mediaItems, currentIndex, setCurrentIndex } = useMediaViewer();
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const currentMedia = mediaItems[currentIndex] as MediaItem | undefined;
  const isEnhancedImage = currentMedia?.type === "image" && (currentMedia as MediaItem & { originalImageUrl?: string }).originalImageUrl;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
          break;
        case "ArrowRight":
          if (currentIndex < mediaItems.length - 1) setCurrentIndex(currentIndex + 1);
          break;
        case "Escape":
          closeViewer();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, mediaItems.length, setCurrentIndex, closeViewer]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !currentMedia) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        {currentMedia.type === "video" ? (
          <video
            src={currentMedia.url}
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: "blur(50px) brightness(0.95)" }}
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${currentMedia.url})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
              backgroundRepeat: "no-repeat",
              filter: "blur(50px) brightness(0.95)",
              transform: "scale(1.1)",
            }}
          />
        )}
      </div>

      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative z-10 flex flex-col h-full w-full">
        <div className="absolute top-4 left-4 z-[100] pointer-events-auto">
          <button
            type="button"
            onClick={closeViewer}
            className="h-12 w-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
            title="Close viewer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {mediaItems.length > 1 && (
          <div className="flex justify-center items-center py-4 px-6 relative z-[70]">
            <div className="flex items-center h-[90px] gap-2 px-6 mx-auto w-full max-w-[70%] overflow-x-auto scrollbar-none scroll-smooth">
              {mediaItems.map((item, i) => (
                <button
                  key={`${item.nodeId}-${i}`}
                  className={`flex-shrink-0 relative transition-all overflow-hidden rounded-lg ${
                    i === currentIndex ? "scale-110 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                  }`}
                  style={{
                    width: i === currentIndex ? 53 : 35,
                    height: i === currentIndex ? 53 : 35,
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}
                  onClick={() => setCurrentIndex(i)}
                >
                  {item.type === "video" ? (
                    <video src={item.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                  ) : (
                    <Image src={item.url} alt="" fill className="object-cover" loading="lazy" draggable={false} unoptimized />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row h-full p-4 md:p-6 gap-6">
          <div className="w-full flex-shrink-0 mb-6 lg:mb-0 h-[50vh] lg:h-full relative">
            <div className="w-full h-full flex items-center justify-center p-2">
              <div
                className="relative overflow-hidden rounded-[36px] bg-black/0 flex items-center justify-center"
                style={{
                  width: "100%",
                  height: "100%",
                  maxWidth: "1200px",
                  maxHeight: "80vh",
                  aspectRatio: imageDimensions ? `${imageDimensions.width} / ${imageDimensions.height}` : undefined,
                  transition: "aspect-ratio 0.3s ease",
                }}
              >
                {currentMedia.type === "video" ? (
                  <video
                    src={currentMedia.url}
                    className="w-full h-full object-contain rounded-[36px]"
                    controls
                    autoPlay
                    loop
                    playsInline
                    onLoadedData={(e) => {
                      const video = e.currentTarget;
                      setImageDimensions({ width: video.videoWidth, height: video.videoHeight });
                    }}
                  />
                ) : isEnhancedImage ? (
                  <BeforeAfterSlider
                    beforeImage={(currentMedia as MediaItem & { originalImageUrl?: string }).originalImageUrl}
                    afterImage={currentMedia.url}
                  />
                ) : (
                  <Image
                    src={currentMedia.url}
                    alt="Media"
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw"
                    className="object-contain rounded-[36px]"
                    unoptimized
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
