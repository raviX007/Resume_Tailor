"use client";

import { CATEGORY_LABELS } from "@/lib/utils";

interface KeywordChipsProps {
  matched: Record<string, string[]>;
  missing: Record<string, string[]>;
  injectable: Record<string, string[]>;
}

function ChipGroup({
  title,
  keywords,
  variant,
}: {
  title: string;
  keywords: Record<string, string[]>;
  variant: "matched" | "missing" | "injectable";
}) {
  const colors = {
    matched: "bg-green-50 text-green-700 border-green-200",
    missing: "bg-red-50 text-red-700 border-red-200",
    injectable: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const hasAny = Object.values(keywords).some((arr) => arr.length > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-2" role="group" aria-label={title}>
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      {Object.entries(keywords).map(([cat, kws]) => {
        if (kws.length === 0) return null;
        return (
          <div key={cat} className="flex flex-wrap gap-1.5">
            <span className="text-xs text-gray-400 w-16 pt-1 shrink-0">
              {CATEGORY_LABELS[cat] || cat}
            </span>
            <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
              {kws.map((kw) => (
                <li
                  key={kw}
                  className={`px-2 py-0.5 text-xs rounded-full border ${colors[variant]}`}
                >
                  {kw}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function KeywordChips({ matched, missing, injectable }: KeywordChipsProps) {
  return (
    <div className="space-y-4">
      <ChipGroup title="Matched (in your resume)" keywords={matched} variant="matched" />
      <ChipGroup title="Injectable (in master skills, adding to resume)" keywords={injectable} variant="injectable" />
      <ChipGroup title="Missing (not in your skills)" keywords={missing} variant="missing" />
    </div>
  );
}
