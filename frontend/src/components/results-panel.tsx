"use client";

import { TailorResponse } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { MatchScore } from "./match-score";
import { KeywordChips } from "./keyword-chips";
import { ReorderInfo } from "./reorder-info";
import { DiffView } from "./diff-view";
import { DownloadButton } from "./download-button";

interface ResultsPanelProps {
  result: TailorResponse;
  companyName?: string;
  refinementText: string;
  onRefinementChange: (value: string) => void;
  onRefine: () => void;
  refining: boolean;
}

export function ResultsPanel({
  result,
  companyName,
  refinementText,
  onRefinementChange,
  onRefine,
  refining,
}: ResultsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header with score and download */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {result.extracted.role_title || "Resume Tailored"}
          </h2>
          {result.extracted.experience_level && (
            <p className="text-sm text-gray-500 mt-1">
              Experience: {result.extracted.experience_level}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Processed in {formatDuration(result.processing_time_ms)}
          </p>
        </div>
        <MatchScore
          score={result.match.match_score}
          totalMatched={result.match.total_matched}
          totalKeywords={result.match.total_jd_keywords}
        />
      </div>

      {/* Download buttons */}
      <DownloadButton
        pdfB64={result.pdf_b64}
        pdfError={result.pdf_error}
        texContent={result.tex_content}
        filename={result.filename}
        companyName={companyName}
      />

      {/* Refine section */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <label htmlFor="refine-input" className="text-sm font-semibold text-gray-700">
          Refine this resume
        </label>
        <div className="flex gap-2 mt-2">
          <input
            id="refine-input"
            type="text"
            value={refinementText}
            onChange={(e) => onRefinementChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && refinementText.trim()) onRefine(); }}
            placeholder="e.g. Move Python higher, add Kubernetes to skills..."
            disabled={refining}
            className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={onRefine}
            disabled={!refinementText.trim() || refining}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0 ${
              refinementText.trim() && !refining
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                : "bg-gray-100 border border-gray-300 cursor-not-allowed text-gray-400"
            }`}
          >
            {refining ? "Refining..." : "Refine"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Re-runs the pipeline with your instructions. Cached steps are instant.
        </p>
      </div>

      {/* Keyword analysis */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Keyword Analysis</h3>
        <KeywordChips
          matched={result.match.matched}
          missing={result.match.missing_from_resume}
          injectable={result.match.injectable}
        />
      </div>

      {/* Reorder plan */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <ReorderInfo plan={result.reorder_plan} />
      </div>

      {/* Diff view */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <DiffView diff={result.tex_diff} />
      </div>
    </div>
  );
}
