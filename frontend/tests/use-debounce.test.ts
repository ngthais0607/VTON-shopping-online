import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebounce } from "../hooks/use-debounce";

describe("useDebounce Hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("should delay updating value until timeout expires", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "first", delay: 300 } }
    );

    expect(result.current).toBe("first");

    // Update prop
    rerender({ value: "second", delay: 300 });
    expect(result.current).toBe("first");

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("second");
  });
});
