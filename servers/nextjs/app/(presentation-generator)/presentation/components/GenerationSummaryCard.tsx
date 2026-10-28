import { X } from "lucide-react";
import type { GenerationSummary } from "../hooks/useSlideVideo";
import { failureLabel } from "../utils/avatarGeneration";

export function GenerationSummaryCard({
  summary,
  onDismiss,
}: {
  summary: GenerationSummary;
  onDismiss: () => void;
}) {
  const problems = [...summary.failed, ...summary.skipped];
  return (
    <section className="mt-7 rounded-[8px] border border-[#EDEEF0] bg-white p-3 text-[11px] leading-4 text-[#344054]">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-medium text-[#101323]">
          {summary.generated} generated, {summary.failed.length} failed,{" "}
          {summary.skipped.length} skipped
        </p>
        <button
          type="button"
          aria-label="Dismiss summary"
          onClick={onDismiss}
          className="text-[#98A2B3] hover:text-[#344054]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {problems.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {problems.map((item) => (
            <li key={`${item.slideIndex}-${item.reason}`}>
              Slide {item.slideIndex + 1}: {failureLabel(item.reason)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
