import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchScore } from "../match-score";

describe("MatchScore", () => {
  it("renders score percentage", () => {
    render(<MatchScore score={75} totalMatched={15} totalKeywords={20} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders keyword count text", () => {
    render(<MatchScore score={60} totalMatched={12} totalKeywords={20} />);
    expect(screen.getByText("12 / 20 keywords matched")).toBeInTheDocument();
  });

  it("has accessible figure role with score info", () => {
    render(<MatchScore score={85} totalMatched={17} totalKeywords={20} />);
    const figure = screen.getByRole("figure");
    expect(figure).toHaveAttribute(
      "aria-label",
      "Match score: 85%, 17 of 20 keywords matched",
    );
  });

  it("applies green color for high scores (>= 70)", () => {
    render(<MatchScore score={70} totalMatched={14} totalKeywords={20} />);
    const scoreText = screen.getByText("70%");
    expect(scoreText.className).toContain("text-green-500");
  });

  it("applies yellow color for mid scores (40-69)", () => {
    render(<MatchScore score={50} totalMatched={10} totalKeywords={20} />);
    const scoreText = screen.getByText("50%");
    expect(scoreText.className).toContain("text-yellow-500");
  });

  it("applies red color for low scores (< 40)", () => {
    render(<MatchScore score={20} totalMatched={4} totalKeywords={20} />);
    const scoreText = screen.getByText("20%");
    expect(scoreText.className).toContain("text-red-500");
  });

  it("hides SVG from screen readers", () => {
    render(<MatchScore score={50} totalMatched={10} totalKeywords={20} />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
