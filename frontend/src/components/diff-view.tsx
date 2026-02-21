"use client";

import { useMemo, useState } from "react";

interface DiffViewProps {
  diff: string;
}

export function DiffView({ diff }: DiffViewProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => diff.split("\n"), [diff]);
  const changeCount = useMemo(
    () => lines.filter((l) => l.startsWith("+") || l.startsWith("-")).length,
    [lines],
  );

  if (!diff) {
    return (
      <p className="text-sm text-gray-400 italic">No changes made to the resume.</p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          &#9654;
        </span>
        LaTeX Diff ({changeCount} changes)
      </button>

      {expanded && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-x-auto max-h-96 overflow-y-auto">
          <pre className="text-xs p-4 leading-relaxed">
            {lines.map((line, i) => {
              let className = "text-gray-600";
              if (line.startsWith("+++") || line.startsWith("---")) {
                className = "text-gray-500 font-bold";
              } else if (line.startsWith("+")) {
                className = "text-green-700 bg-green-50";
              } else if (line.startsWith("-")) {
                className = "text-red-700 bg-red-50";
              } else if (line.startsWith("@@")) {
                className = "text-blue-600";
              }
              return (
                <div key={i} className={className}>
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}
