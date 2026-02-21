"use client";

import { ReorderPlan } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/utils";

interface ReorderInfoProps {
  plan: ReorderPlan;
}

export function ReorderInfo({ plan }: ReorderInfoProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">Reorder Plan</h4>

      <div className="space-y-2 text-sm">
        <div>
          <span className="text-gray-400">Skills order: </span>
          <span className="text-gray-700">
            {plan.skills_category_order
              .map((cat) => CATEGORY_LABELS[cat] || cat)
              .join(" → ")}
          </span>
        </div>

        <div>
          <span className="text-gray-400">Project order: </span>
          <span className="text-gray-700">
            {plan.project_order
              .map((p) => p.replace(/_/g, " "))
              .join(" → ")}
          </span>
        </div>

        <div>
          <span className="text-gray-400">Summary opens with: </span>
          <span className="text-gray-600 italic">
            &ldquo;{plan.summary_first_line.length > 80
              ? `${plan.summary_first_line.slice(0, 80)}...`
              : plan.summary_first_line}&rdquo;
          </span>
        </div>
      </div>
    </div>
  );
}
