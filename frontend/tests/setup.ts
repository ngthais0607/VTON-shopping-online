import "@testing-library/jest-dom";

if (typeof window !== "undefined" && typeof (window as any).BroadcastChannel === "undefined") {
  if (typeof globalThis.BroadcastChannel !== "undefined") {
    (window as any).BroadcastChannel = globalThis.BroadcastChannel;
  }
}
