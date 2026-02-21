import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../error-boundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test crash");
  return <p>Child rendered</p>;
}

describe("ErrorBoundary", () => {
  // Suppress React error logging during intentional throws
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Child rendered")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test crash")).toBeInTheDocument();
  });

  it("renders try again button in error state", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("resets error state when try again is clicked", async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function ControlledChild() {
      if (shouldThrow) throw new Error("Test crash");
      return <p>Child rendered</p>;
    }

    render(
      <ErrorBoundary>
        <ControlledChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Stop throwing before clicking Try Again
    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByText("Child rendered")).toBeInTheDocument();
  });
});
