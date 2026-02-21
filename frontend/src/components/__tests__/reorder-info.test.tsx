import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReorderInfo } from "../reorder-info";
import type { ReorderPlan } from "@/lib/types";

const basePlan: ReorderPlan = {
  skills_category_order: ["backend", "languages", "devops"],
  project_order: ["resume_tailor", "job_tracker"],
  summary_first_line: "Experienced backend engineer specializing in distributed systems",
  experience_emphasis: {},
};

describe("ReorderInfo", () => {
  it("renders skills category order with labels", () => {
    render(<ReorderInfo plan={basePlan} />);
    expect(screen.getByText(/Backend → Languages → DevOps/)).toBeInTheDocument();
  });

  it("renders project order with underscores replaced", () => {
    render(<ReorderInfo plan={basePlan} />);
    expect(screen.getByText(/resume tailor → job tracker/)).toBeInTheDocument();
  });

  it("renders summary first line", () => {
    render(<ReorderInfo plan={basePlan} />);
    expect(
      screen.getByText(/Experienced backend engineer/),
    ).toBeInTheDocument();
  });

  it("truncates long summary lines with ellipsis", () => {
    const longPlan: ReorderPlan = {
      ...basePlan,
      summary_first_line: "A".repeat(100),
    };
    render(<ReorderInfo plan={longPlan} />);
    // Text is split across child nodes (quote marks), so use a function matcher
    const truncated = "A".repeat(80) + "...";
    expect(
      screen.getByText((_content, element) =>
        element?.tagName === "SPAN" && element.textContent?.includes(truncated) || false,
      ),
    ).toBeInTheDocument();
  });

  it("renders section heading", () => {
    render(<ReorderInfo plan={basePlan} />);
    expect(screen.getByText("Reorder Plan")).toBeInTheDocument();
  });
});
