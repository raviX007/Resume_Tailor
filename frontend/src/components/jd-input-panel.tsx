"use client";

import { memo, useRef, useState } from "react";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — matches backend

interface JdInputPanelProps {
  jdText: string;
  jobTitle: string;
  companyName: string;
  resumeFile: File | null;
  userInstructions: string;
  onJdChange: (value: string) => void;
  onJobTitleChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onUserInstructionsChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  step?: string | null;
}

export const JdInputPanel = memo(function JdInputPanel({
  jdText,
  jobTitle,
  companyName,
  resumeFile,
  userInstructions,
  onJdChange,
  onJobTitleChange,
  onCompanyChange,
  onFileChange,
  onUserInstructionsChange,
  onSubmit,
  loading,
  step,
}: JdInputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const isValid = jdText.trim().length >= 50 && resumeFile !== null;

  const handleFile = (file: File | null) => {
    setFileError(null);
    if (file && !file.name.endsWith(".tex")) {
      setFileError("Only .tex files are accepted");
      return;
    }
    if (file && file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max 2MB)`);
      return;
    }
    onFileChange(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0] || null;
    handleFile(file);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <p className="text-sm text-gray-500">
          Upload your LaTeX resume and paste a job description to get a tailored PDF
        </p>
      </div>

      {/* File upload zone */}
      <div>
        <label className="text-sm font-medium text-gray-700">
          LaTeX Resume <span className="text-red-500">*</span>
        </label>
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload LaTeX resume file"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mt-1 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : resumeFile
              ? "border-green-500 bg-green-50"
              : "border-gray-300 hover:border-gray-400 bg-white"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".tex"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          {resumeFile ? (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{resumeFile.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onFileChange(null); setFileError(null); }}
                className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove file"
                aria-label="Remove uploaded file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm">Drop your <span className="text-gray-900 font-medium">.tex</span> file here or click to browse</p>
              <p className="text-xs mt-1 text-gray-400">
                Don&apos;t have a .tex? Ask ChatGPT/Claude to convert your resume, or use{" "}
                <a href="https://mathpix.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Mathpix
                </a>
              </p>
            </div>
          )}
        </div>
        {fileError && (
          <p className="mt-1 text-xs text-red-500" role="alert">{fileError}</p>
        )}
      </div>

      {/* JD textarea */}
      <div className="flex-1 flex flex-col gap-1">
        <label htmlFor="jd-textarea" className="text-sm font-medium text-gray-700">
          Job Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="jd-textarea"
          value={jdText}
          onChange={(e) => onJdChange(e.target.value)}
          placeholder="Paste the full job description here (minimum 50 characters)..."
          className="flex-1 w-full bg-white border border-gray-300 rounded-xl p-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-400 text-right">
          {jdText.length} characters {jdText.length < 50 && jdText.length > 0 && "(min 50)"}
        </p>
      </div>

      {/* Optional fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="job-title" className="text-xs font-medium text-gray-500">Job Title (optional)</label>
          <input
            id="job-title"
            type="text"
            value={jobTitle}
            onChange={(e) => onJobTitleChange(e.target.value)}
            placeholder="e.g. Backend Developer"
            className="w-full mt-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="company-name" className="text-xs font-medium text-gray-500">Company (optional)</label>
          <input
            id="company-name"
            type="text"
            value={companyName}
            onChange={(e) => onCompanyChange(e.target.value)}
            placeholder="e.g. Acme Corp"
            className="w-full mt-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Custom instructions */}
      <div>
        <label htmlFor="user-instructions" className="text-xs font-medium text-gray-500">Custom Instructions (optional)</label>
        <textarea
          id="user-instructions"
          value={userInstructions}
          onChange={(e) => onUserInstructionsChange(e.target.value)}
          placeholder="e.g. Add Docker and Kubernetes to skills, emphasize backend experience..."
          rows={2}
          className="w-full mt-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={!isValid || loading}
        aria-label={loading ? "Tailoring in progress" : "Tailor resume"}
        className={`w-full py-3 rounded-xl font-medium transition-all ${
          isValid && !loading
            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow cursor-pointer"
            : "bg-gray-100 border border-gray-300 cursor-not-allowed text-gray-400"
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {step || "Tailoring Resume..."}
          </span>
        ) : (
          "Tailor Resume"
        )}
      </button>
    </div>
  );
});
