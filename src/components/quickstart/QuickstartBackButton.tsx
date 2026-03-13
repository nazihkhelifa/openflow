"use client";

interface QuickstartBackButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function QuickstartBackButton({
  onClick,
  disabled = false,
}: QuickstartBackButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center gap-1.5 text-sm font-medium text-neutral-400
        hover:text-neutral-200 transition-colors
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      <span>Back</span>
    </button>
  );
}
