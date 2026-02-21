import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffView } from "../diff-view";

describe("DiffView", () => {
  it("shows 'no changes' message for empty diff", () => {
    render(<DiffView diff="" />);
    expect(screen.getByText("No changes made to the resume.")).toBeInTheDocument();
  });

  it("shows change count in collapsed state", () => {
    const diff = "+added line\n-removed line\n context line";
    render(<DiffView diff={diff} />);
    expect(screen.getByText(/2 changes/)).toBeInTheDocument();
  });

  it("starts collapsed — no diff lines visible", () => {
    const diff = "+added\n-removed";
    render(<DiffView diff={diff} />);
    expect(screen.queryByText("+added")).toBeNull();
  });

  it("expands on click to show diff lines", async () => {
    const user = userEvent.setup();
    const diff = "+new line\n-old line";
    render(<DiffView diff={diff} />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("+new line")).toBeInTheDocument();
    expect(screen.getByText("-old line")).toBeInTheDocument();
  });

  it("toggles aria-expanded attribute", async () => {
    const user = userEvent.setup();
    render(<DiffView diff="+a" />);

    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("applies green styling to added lines", async () => {
    const user = userEvent.setup();
    render(<DiffView diff="+added" />);
    await user.click(screen.getByRole("button"));

    const addedLine = screen.getByText("+added");
    expect(addedLine.className).toContain("text-green-700");
  });

  it("applies red styling to removed lines", async () => {
    const user = userEvent.setup();
    render(<DiffView diff="-removed" />);
    await user.click(screen.getByRole("button"));

    const removedLine = screen.getByText("-removed");
    expect(removedLine.className).toContain("text-red-700");
  });
});
