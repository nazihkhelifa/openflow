"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface NodeVideoPlayerProps {
  src: string | undefined;
  /** Optional key to force remount when video changes (e.g. carousel) */
  videoKey?: string;
  /** Auto-play on load */
  autoPlay?: boolean;
  /** Loop video */
  loop?: boolean;
  /** Start muted (recommended for autoplay) */
  muted?: boolean;
  /** object-fit: cover | contain */
  objectFit?: "cover" | "contain";
  /** Additional actions (expand, clear, etc.) - rendered top-right */
  actions?: React.ReactNode;
  /** Optional left-side actions (e.g. source/trimmed toggle) */
  leftActions?: React.ReactNode;
  /** Optional loading overlay */
  loadingOverlay?: React.ReactNode;
  /** Optional error overlay */
  errorOverlay?: React.ReactNode;
  /** Optional bottom overlay (e.g. carousel controls) */
  bottomOverlay?: React.ReactNode;
  /** Extra class for the container */
  className?: string;
  /** When true, prevents clicks from bubbling to parent (e.g. for lightbox containers) */
  stopPropagation?: boolean;
  /** When true, hide progress bar and controls below video (compact inline display) */
  compact?: boolean;
}

export function NodeVideoPlayer({
  src,
  videoKey,
  autoPlay = true,
  loop = true,
  muted = true,
  objectFit = "contain",
  actions,
  leftActions,
  loadingOverlay,
  errorOverlay,
  bottomOverlay,
  className = "",
  stopPropagation = false,
  compact = false,
}: NodeVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(muted);
  const [isHovering, setIsHovering] = useState(false);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) setCurrentTime(video.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) setDuration(video.duration);
  }, []);

  const handleDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration)) setDuration(video.duration);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) setCurrentTime(0);
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressBarRef.current;
      const video = videoRef.current;
      if (!bar || !video || !Number.isFinite(duration) || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const seekTo = Math.max(0, Math.min(1, x)) * duration;
      video.currentTime = seekTo;
      setCurrentTime(seekTo);
    },
    [duration]
  );

  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("ended", handleEnded);
    };
  }, [handleTimeUpdate, handleLoadedMetadata, handleDurationChange, handleEnded]);

  if (!src) return null;

  return (
    <div
      className={`node-video-player group relative flex flex-col overflow-hidden rounded-2xl ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {/* Checker pattern + video container */}
      <div className="alpha-checker-pattern relative flex-1 min-h-0 cursor-pointer overflow-hidden rounded-2xl">
        <video
          ref={videoRef}
          key={videoKey}
          src={src}
          preload="metadata"
          loop={loop}
          muted={isMuted}
          playsInline
          autoPlay={autoPlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className={`h-full w-full object-center transition-opacity duration-200 ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
          onClick={togglePlay}
        />

        {/* Loading overlay */}
        {loadingOverlay}

        {/* Error overlay */}
        {errorOverlay}

        {/* Play button overlay - centered, visible when paused and hovering */}
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200 pointer-events-none ${
            !isPlaying && isHovering ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={togglePlay}
            className="nodrag nopan pointer-events-auto flex items-center justify-center rounded-full bg-black/40 p-3 text-white transition-all duration-200 hover:bg-black/60"
            aria-label="Play"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          </button>
        </div>

        {/* Volume mute button - top right, on hover */}
        <button
          type="button"
          onClick={toggleMute}
          className={`nodrag nopan absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-white transition-all duration-200 hover:bg-black/60 ${
            isHovering ? "opacity-100" : "opacity-0"
          }`}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
              <line x1="22" x2="16" y1="9" y2="15" />
              <line x1="16" x2="22" y1="9" y2="15" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
            </svg>
          )}
        </button>

        {/* Left actions (e.g. source/trimmed toggle) */}
        {leftActions && (
          <div className="absolute top-1 left-1 flex gap-1 z-20">
            {leftActions}
          </div>
        )}

        {/* Actions (expand, clear, etc.) - top right */}
        {actions && (
          <div className="absolute top-1 right-1 flex gap-1 z-20">
            {actions}
          </div>
        )}

        {/* Bottom overlay (e.g. carousel) - inside video area */}
        {bottomOverlay && (
          <div className="absolute bottom-0 left-0 right-0 z-20">
            {bottomOverlay}
          </div>
        )}
      </div>

      {/* Custom progress bar - below video (hidden in compact mode) */}
      {!compact && (
      <div className="nodrag nopan flex h-5 items-center gap-2 pt-2 px-1 shrink-0">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-5 shrink-0 items-center justify-center text-neutral-200 transition-opacity duration-200 hover:text-white"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M3 2L10 6L3 10V2Z" />
            </svg>
          )}
        </button>
        <div
          ref={progressBarRef}
          role="progressbar"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration}
          className="group/progress relative flex h-5 min-w-0 flex-1 cursor-pointer items-center"
          onClick={handleProgressClick}
        >
          <div className="h-1 w-full rounded-full bg-white/20">
            <div
              className="h-full w-full origin-left rounded-full bg-white transition-transform duration-100"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-opacity duration-150"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums text-xs text-neutral-400">
          {formatTime(currentTime)}
        </span>
      </div>
      )}
    </div>
  );
}
