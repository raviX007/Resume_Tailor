import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeywordChips } from "../keyword-chips";

const emptyRecord = (): Record<string, string[]> => ({
  languages: [],
  backend: [],
  frontend: [],
  ai_llm: [],
  databases: [],
  devops: [],
  soft_skills: [],
  domains: [],
});

describe("KeywordChips", () => {
  it("renders matched keywords as chips", () => {
    const matched = { ...emptyRecord(), languages: ["Python", "Go"] };
    render(
      <KeywordChips matched={matched} missing={emptyRecord()} injectable={emptyRecord()} />,
    );
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("renders missing keywords section", () => {
    const missing = { ...emptyRecord(), backend: ["Django"] };
    render(
      <KeywordChips matched={emptyRecord()} missing={missing} injectable={emptyRecord()} />,
    );
    expect(screen.getByText("Missing (not in your skills)")).toBeInTheDocument();
    expect(screen.getByText("Django")).toBeInTheDocument();
  });

  it("renders injectable keywords section", () => {
    const injectable = { ...emptyRecord(), devops: ["Docker"] };
    render(
      <KeywordChips matched={emptyRecord()} missing={emptyRecord()} injectable={injectable} />,
    );
    expect(
      screen.getByText("Injectable (in master skills, adding to resume)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
  });

  it("renders nothing when all categories are empty", () => {
    const { container } = render(
      <KeywordChips matched={emptyRecord()} missing={emptyRecord()} injectable={emptyRecord()} />,
    );
    expect(container.querySelector("[role='group']")).toBeNull();
  });

  it("uses CATEGORY_LABELS for display names", () => {
    const matched = { ...emptyRecord(), ai_llm: ["LangChain"] };
    render(
      <KeywordChips matched={matched} missing={emptyRecord()} injectable={emptyRecord()} />,
    );
    expect(screen.getByText("AI / LLM")).toBeInTheDocument();
  });

  it("skips empty categories within a group", () => {
    const matched = {
      ...emptyRecord(),
      languages: ["Rust"],
      frontend: [], // should not render
    };
    render(
      <KeywordChips matched={matched} missing={emptyRecord()} injectable={emptyRecord()} />,
    );
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.queryByText("Frontend")).toBeNull();
  });
});
