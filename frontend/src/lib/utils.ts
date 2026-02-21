import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  languages: "Languages",
  backend: "Backend",
  frontend: "Frontend",
  ai_llm: "AI / LLM",
  databases: "Databases",
  devops: "DevOps",
  soft_skills: "Soft Skills",
  domains: "Domains",
};
