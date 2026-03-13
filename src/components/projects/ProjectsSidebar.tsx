"use client";

type ProjectsSidebarProps = {
  onOpenSettings?: () => void;
};

export function ProjectsSidebar(_props: ProjectsSidebarProps) {
  return (
    <aside className="w-14 flex-shrink-0 flex flex-col bg-neutral-950/50 p-3" />
  );
}
