"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MediaItem } from "@/lib/media-collector";

export type { MediaItem };

interface MediaViewerContextType {
  openViewer: (mediaItems: MediaItem[], currentIndex: number) => void;
  closeViewer: () => void;
  isOpen: boolean;
  mediaItems: MediaItem[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
}

const MediaViewerContext = createContext<MediaViewerContextType | undefined>(undefined);

export const useMediaViewer = () => {
  const context = useContext(MediaViewerContext);
  if (!context) {
    throw new Error("useMediaViewer must be used within MediaViewerProvider");
  }
  return context;
};

export const MediaViewerProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const openViewer = (items: MediaItem[], index: number) => {
    setMediaItems(items);
    setCurrentIndex(index);
    setIsOpen(true);
  };

  const closeViewer = () => {
    setIsOpen(false);
    setMediaItems([]);
    setCurrentIndex(0);
  };

  return (
    <MediaViewerContext.Provider
      value={{
        openViewer,
        closeViewer,
        isOpen,
        mediaItems,
        currentIndex,
        setCurrentIndex,
      }}
    >
      {children}
    </MediaViewerContext.Provider>
  );
};
