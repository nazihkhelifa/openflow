"use client";

import { useId, useMemo, type RefObject } from "react";
import { AtSign, Loader2, Paperclip, X } from "lucide-react";
import {
  FLOWY_PLANNER_LLM_OPTIONS,
  flowyPlannerLlmOptionId,
  type FlowyAgentMode,
  type FlowyPlannerLlmChoice,
} from "@/lib/flowy/flowyPanelStorage";

export type FlowyContextNodeChip = {
  id: string;
  label: string;
  type: string;
  source: "selected" | "mentioned" | "context";
};

export type FlowyChatImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type FlowyCanvasChatComposerProps = {
  /** Optional id for the message textarea (from parent `useId()` for stable a11y across portals). */
  textareaId?: string;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isPlanning: boolean;
  isExecutingStep: boolean;
  isRunning: boolean;
  chatInputPlaceholder: string;
  /** Thread selected in history rail — next composer send will fork and merge this thread’s capped history into the planner payload. */
  continuationTitle?: string | null;
  continuationPreview?: string | null;
  onClearContinuation?: () => void;
  contextNodeChips: FlowyContextNodeChip[];
  onRemoveMentionedNode: (nodeId: string) => void;
  imageAttachments: FlowyChatImageAttachment[];
  onRemoveImageAttachment: (id: string) => void;
  imageInputRef: RefObject<HTMLInputElement | null>;
  onImageFilesSelected: (files: FileList | null) => void;
  flowyAgentMode: FlowyAgentMode;
  onFlowyAgentModeChange: (mode: FlowyAgentMode) => void;
  plannerLlm: FlowyPlannerLlmChoice;
  onPlannerLlmChange: (choice: FlowyPlannerLlmChoice) => void;
  onOpenNodePicker: () => void;
};

export function FlowyCanvasChatComposer({
  textareaId,
  input,
  onInputChange,
  onSubmit,
  isPlanning,
  isExecutingStep,
  isRunning,
  chatInputPlaceholder,
  continuationTitle,
  continuationPreview,
  onClearContinuation,
  contextNodeChips,
  onRemoveMentionedNode,
  imageAttachments,
  onRemoveImageAttachment,
  imageInputRef,
  onImageFilesSelected,
  flowyAgentMode,
  onFlowyAgentModeChange,
  plannerLlm,
  onPlannerLlmChange,
  onOpenNodePicker,
}: FlowyCanvasChatComposerProps) {
  const generatedTextareaId = useId();
  const inputId = textareaId ?? generatedTextareaId;
  const modeSliderIndex = useMemo(() => (flowyAgentMode === "assist" ? 0 : 1), [flowyAgentMode]);

  return (
    <div className="pointer-events-auto w-full max-w-[min(100vw-2rem,32rem)]">
      <form
        data-testid="flowy-canvas-composer"
        className="relative w-full overflow-visible rounded-[1.25rem] border border-white/10 bg-[#222222]/95 pb-1.5 pl-3 pr-1.5 pt-3 shadow-inner shadow-black/40 backdrop-blur-[12px] focus-within:border-white/20"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-2.5">
          {isPlanning && (
            <div className="-mt-1 flex items-center gap-2 px-1 text-[11px] text-neutral-400">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>Flowy is thinking...</span>
            </div>
          )}
          {(continuationTitle || continuationPreview) && (
            <div
              className="-mt-1 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.08] px-2 py-1.5"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-200/80">
                    Context for next send
                  </p>
                  {continuationTitle ? (
                    <p className="truncate text-[12px] font-medium text-neutral-100">{continuationTitle}</p>
                  ) : null}
                  {continuationPreview ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-neutral-400">
                      {continuationPreview}
                    </p>
                  ) : null}
                </div>
                {onClearContinuation ? (
                  <button
                    type="button"
                    onClick={onClearContinuation}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                    aria-label="Clear attached thread context"
                    title="Clear"
                  >
                    <X className="size-3.5" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {contextNodeChips.length > 0 && (
            <div
              role="list"
              aria-label="Selected nodes"
              className="-ml-3 -mr-1.5 -mt-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max gap-1.5 pb-1 pl-1.5 pr-1 pt-1.5">
                {contextNodeChips.map((chip) => {
                  const isSelected = chip.source === "selected";
                  return (
                    <span
                      key={chip.id}
                      role="listitem"
                      className="group/chip inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] py-[3px] pl-1 pr-2"
                      title={`${chip.label} (${chip.type})`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="max-w-[120px] truncate text-[11px] font-medium text-neutral-100">
                          {chip.label}
                        </span>
                        <span className="text-left text-[10px] text-neutral-400">{chip.type}</span>
                      </span>
                      {!isSelected && (
                        <button
                          type="button"
                          className="hidden size-4 items-center justify-center rounded-full border border-white/10 bg-[#222] text-neutral-300 transition-colors hover:text-white group-hover/chip:flex"
                          aria-label={`Remove ${chip.label}`}
                          onClick={() => onRemoveMentionedNode(chip.id)}
                        >
                          x
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {imageAttachments.length > 0 && (
            <div
              role="list"
              aria-label="Attached images"
              className="-ml-3 -mr-1.5 -mt-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max gap-1.5 pb-1 pl-1.5 pr-1 pt-1">
                {imageAttachments.map((img) => (
                  <span
                    key={img.id}
                    role="listitem"
                    className="group/chip inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] py-[3px] pl-1 pr-2"
                    title={img.name}
                  >
                    <span className="size-7 overflow-hidden rounded-md border border-white/10">
                      <img src={img.dataUrl} alt="" className="size-full object-cover" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="max-w-[110px] truncate text-[11px] font-medium text-neutral-100">
                        {img.name}
                      </span>
                      <span className="text-left text-[10px] text-neutral-400">Image</span>
                    </span>
                    <button
                      type="button"
                      className="hidden size-4 items-center justify-center rounded-full border border-white/10 bg-[#222] text-neutral-300 transition-colors hover:text-white group-hover/chip:flex"
                      aria-label={`Remove ${img.name}`}
                      onClick={() => onRemoveImageAttachment(img.id)}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="relative w-full pr-2" data-flowy-chat-input>
            <label htmlFor={inputId} className="sr-only">
              Chat message
            </label>
            <textarea
              id={inputId}
              rows={1}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={chatInputPlaceholder}
              disabled={isPlanning}
              className="max-h-[200px] min-h-[22px] w-full resize-none bg-transparent text-sm leading-snug text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-1">
            <div
              className="relative grid w-[min(100%,10rem)] shrink-0 grid-cols-2 rounded-xl bg-[#313131] p-1"
              role="radiogroup"
              aria-label="Chat mode"
            >
              <div className="pointer-events-none absolute inset-1" aria-hidden>
                <div
                  className="h-full w-1/2 rounded-lg bg-white/10 transition-transform duration-200 ease-out"
                  style={{ transform: `translateX(${modeSliderIndex * 100}%)` }}
                />
              </div>
              {(["assist", "plan"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={flowyAgentMode === m}
                  onClick={() => onFlowyAgentModeChange(m)}
                  disabled={isPlanning || isExecutingStep || isRunning}
                  className={`relative z-10 rounded-lg px-1 py-0.5 text-[11px] font-medium leading-[1.25] tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                    flowyAgentMode === m ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {m === "assist" ? "Assist" : "Chat"}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="flowy-planner-model-canvas">
              Planner model
            </label>
            <select
              id="flowy-planner-model-canvas"
              aria-label="Planner model"
              value={flowyPlannerLlmOptionId(plannerLlm)}
              onChange={(e) => {
                const id = e.target.value;
                const opt = FLOWY_PLANNER_LLM_OPTIONS.find(
                  (o) => flowyPlannerLlmOptionId({ provider: o.provider, model: o.model }) === id
                );
                if (opt) onPlannerLlmChange({ provider: opt.provider, model: opt.model });
              }}
              disabled={isPlanning || isExecutingStep || isRunning}
              className="min-w-0 max-w-[min(100%,14rem)] shrink rounded-lg border border-white/10 bg-[#313131] px-2 py-1 text-[11px] font-medium text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
            >
              {FLOWY_PLANNER_LLM_OPTIONS.map((o) => (
                <option
                  key={flowyPlannerLlmOptionId({ provider: o.provider, model: o.model })}
                  value={flowyPlannerLlmOptionId({ provider: o.provider, model: o.model })}
                >
                  {o.label}
                </option>
              ))}
            </select>
            <div className="min-w-0 flex-1 basis-[4rem]" />
            <div className="flex shrink-0 items-center gap-0.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => void onImageFilesSelected(e.target.files)}
              />
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                aria-label="Attach images"
                title="Attach images"
                onClick={() => imageInputRef.current?.click()}
                disabled={isPlanning || isExecutingStep || isRunning}
              >
                <Paperclip className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
              <button
                type="button"
                onClick={onOpenNodePicker}
                disabled={isPlanning || isExecutingStep || isRunning}
                className="flex size-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                aria-label="Mention nodes"
                title="Mention nodes (@)"
              >
                <AtSign className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
              <div className="relative ml-0.5 h-10 w-10 shrink-0">
                <div className="absolute inset-0 rounded-[1.25rem] bg-white/10 backdrop-blur-md">
                  <button
                    type="submit"
                    disabled={isPlanning || !input.trim()}
                    className="flex size-full items-center justify-center rounded-[1.15rem] p-1 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Send message"
                  >
                    <svg className="size-[22px]" fill="currentColor" viewBox="0 0 36 36" aria-hidden>
                      <path
                        clipRule="evenodd"
                        fillRule="evenodd"
                        d="M18 0C8.05887 0 0 8.05887 0 18C0 27.9411 8.05887 36 18 36C27.9411 36 36 27.9411 36 18C36 8.05887 27.9411 0 18 0ZM25.7025 16.8428C26.3415 17.4819 26.3415 18.518 25.7025 19.157C25.0634 19.796 24.0273 19.796 23.3883 19.157L19.6364 15.4051V24.5454C19.6364 25.4491 18.9038 26.1817 18 26.1817C17.0963 26.1817 16.3637 25.4491 16.3637 24.5454V15.4049L12.6116 19.157C11.9725 19.796 10.9364 19.796 10.2974 19.157C9.65834 18.518 9.65834 17.4819 10.2974 16.8428L16.8428 10.2974C17.0113 10.1289 17.2075 10.0048 17.4166 9.92517C17.6029 9.85424 17.7995 9.81855 17.9962 9.81811L17.9986 9.81811L18 9.8181C18.0151 9.8181 18.0301 9.81831 18.0451 9.81871C18.2321 9.82385 18.4184 9.86086 18.5951 9.92972C18.6217 9.94017 18.6508 9.95233 18.6767 9.96411C18.8098 10.0247 18.9335 10.1026 19.0447 10.1949C19.0833 10.227 19.1208 10.2612 19.157 10.2974L19.1681 10.3084L25.7025 16.8428Z"
                      />
                    </svg>
                  </button>
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[1.25rem] border border-white/10"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
      <p className="mt-1.5 text-center text-[10px] leading-snug text-neutral-600">
        <span className="text-neutral-500">Flowy is experimental.</span>{" "}
        <span className="text-neutral-600">
          Chat = advice · Assist = build + approve run · Pick a thread in the panel to attach its history to your next
          message
        </span>
      </p>
    </div>
  );
}
