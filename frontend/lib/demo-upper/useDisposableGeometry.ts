"use client";
import { useEffect, useMemo } from "react";

type Disposable = { dispose: () => void };

/**
 * Builds a disposable value (e.g. a BufferGeometry) from `input` and disposes the previous one when the
 * input changes or the component unmounts. Pass a stable, module-level `build` function.
 */
export function useDisposableGeometry<I, T extends Disposable>(input: I, build: (input: I) => T): T {
  const value = useMemo(() => build(input), [build, input]);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}
