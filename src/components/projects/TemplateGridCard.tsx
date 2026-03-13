"use client";

import { useState } from "react";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect fill='%231c1c1c' width='400' height='225'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14'%3ETemplate%3C/text%3E%3C/svg%3E";

export type TemplateGridCardProps = {
  name: string;
  description: string;
  previewImage?: string;
  gradientIndex: number;
  nodeCount: number;
  tags: string[];
  author?: string;
  isLoading?: boolean;
  disabled?: boolean;
  onUse: () => void;
  /** "gettingStarted" = horizontal card with aspect-[3], 340px; "grid" = aspect-tv grid card */
  variant?: "gettingStarted" | "grid";
};

export function TemplateGridCard({
  name,
  description,
  previewImage,
  gradientIndex,
  nodeCount,
  tags,
  author,
  isLoading,
  disabled,
  onUse,
  variant = "grid",
}: TemplateGridCardProps) {
  const [imgError, setImgError] = useState(false);
  const effectiveSrc =
    previewImage && previewImage.trim() && !imgError
      ? previewImage
      : PLACEHOLDER_IMAGE;

  if (variant === "gettingStarted") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !isLoading && onUse()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && !isLoading && onUse()}
        className="flex-shrink-0 w-[340px] group relative cursor-pointer transition-all duration-200 rounded-2xl overflow-hidden"
      >
        <div className="@container relative aspect-[3] w-full overflow-hidden rounded-2xl">
          <img
            src={effectiveSrc}
            alt={name}
            onError={() => setImgError(true)}
            className="absolute inset-0 size-full scale-110 object-cover blur-2xl transition-transform duration-300 group-hover:scale-150"
          />
          <div className="absolute inset-0 bg-[#0f0f0f]/70" />
          <div className="relative z-10 flex h-full">
            <div className="aspect-square h-full flex-shrink-0 overflow-hidden">
              <img
                src={effectiveSrc}
                alt={name}
                onError={() => setImgError(true)}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <div className="flex flex-1 items-center px-3 md:px-4 lg:px-6">
              <h2 className="text-[#c8c8c8] line-clamp-3 text-pretty font-semibold antialiased text-sm md:text-base lg:text-lg">
                {name}
              </h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex w-full flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !isLoading && onUse()}
        onKeyDown={(e) => e.key === "Enter" && !disabled && !isLoading && onUse()}
        className="aspect-tv relative cursor-pointer overflow-hidden rounded-md"
      >
        <img
          src={effectiveSrc}
          alt={name}
          onError={() => setImgError(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
        <div className="absolute inset-0 z-10 flex flex-col justify-between gap-3 p-2 transition-all duration-200 bg-gradient-to-t from-black/75 via-transparent group-hover:from-black/75">
          <div className="flex items-center justify-between gap-1" />
          <div className="space-y-1 transition-opacity duration-300 opacity-0 group-hover:opacity-100">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disabled && !isLoading) onUse();
                }}
                disabled={disabled || isLoading}
                className="flex items-center justify-center gap-2 h-6 px-3 text-xs font-medium rounded-md bg-[#f7f7f7] text-[#0d0d0d] hover:bg-[#e5e5e5] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  "Use"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs font-normal text-[#c8c8c8]">{name}</p>
    </div>
  );
}
