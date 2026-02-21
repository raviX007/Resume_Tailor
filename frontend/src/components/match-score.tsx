"use client";

interface MatchScoreProps {
  score: number;
  totalMatched: number;
  totalKeywords: number;
}

export function MatchScore({ score, totalMatched, totalKeywords }: MatchScoreProps) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 70 ? "text-green-500" :
    score >= 40 ? "text-yellow-500" :
    "text-red-500";

  const strokeColor =
    score >= 70 ? "#22c55e" :
    score >= 40 ? "#eab308" :
    "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2" role="figure" aria-label={`Match score: ${score}%, ${totalMatched} of ${totalKeywords} keywords matched`}>
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
          <circle
            cx="60" cy="60" r={radius}
            fill="none" stroke="#E5E7EB" strokeWidth="8"
          />
          <circle
            cx="60" cy="60" r={radius}
            fill="none" stroke={strokeColor} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{score}%</span>
          <span className="text-xs text-gray-500">match</span>
        </div>
      </div>
      <p className="text-sm text-gray-500">
        {totalMatched} / {totalKeywords} keywords matched
      </p>
    </div>
  );
}
