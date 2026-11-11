import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TryOnModal } from "../components/store/try-on-modal";
import { vtonErrorMessage } from "../lib/vton";

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiGetBlob: vi.fn(),
  apiUpload: vi.fn(),
  apiDelete: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error {
    constructor(message: string, public status?: number, public code?: string) {
      super(message);
    }
  },
}));
const session = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: session.user, isLoading: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const eligibility = { eligible: true, cloth_type: "upper" as const, engine: "mock" as const, daily_quota: 10 };
const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  productId: 5,
  productName: "Basic Tee",
  variantId: 9,
  imageId: "img-77",
  eligibility,
};
const doneTask = {
  id: "t1", product_id: 5, variant_id: 9, cloth_type: "upper", status: "succeeded" as const,
  engine: "mock" as const, error_code: null, has_result: true, has_person_image: true,
  created_at: "2026-01-01T00:00:00Z", finished_at: "2026-01-01T00:00:05Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 1 };
  api.apiGet.mockResolvedValue({ limit: 10, used: 2, remaining: 8, retention_hours: 24 });
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
});

function pickPhoto() {
  const input = document.getElementById("vton-photo") as HTMLInputElement;
  const file = new File([new Uint8Array(10)], "me.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("TryOnModal guidance", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the selected photo being tried on", () => {
    render(<TryOnModal {...baseProps} imageUrl="/img/look.jpg" />);
    expect(screen.getByAltText("Photo you are trying on")).toHaveAttribute("src", "/img/look.jpg");
  });

  it("rejects a photo that is too small before upload", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 120, close: vi.fn() })));
    render(<TryOnModal {...baseProps} />);
    pickPhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent(/too small/);
  });

  it("warns, without blocking, about a landscape photo", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() })));
    render(<TryOnModal {...baseProps} />);
    pickPhoto();
    expect(await screen.findByText(/landscape/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sets expectations for the real engine", () => {
    render(<TryOnModal {...baseProps} eligibility={{ ...eligibility, engine: "catvton" as never }} />);
    expect(screen.getByText(/can take several minutes/)).toBeInTheDocument();
  });
});

describe("TryOnModal", () => {
  it("asks anonymous visitors to sign in", () => {
    session.user = null;
    render(<TryOnModal {...baseProps} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("lists earlier finished try-ons for this product and reopens one", async () => {
    api.apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/vton/tasks")) {
        return {
          items: [doneTask, { ...doneTask, id: "other", product_id: 99 }, { ...doneTask, id: "gone", has_result: false }],
          total: 3,
        };
      }
      return { limit: 10, used: 2, remaining: 8, retention_hours: 24 };
    });
    api.apiGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    render(<TryOnModal {...baseProps} />);
    const thumbs = await screen.findAllByRole("button", { name: /View try-on from/ });
    expect(thumbs).toHaveLength(1);
    expect(api.apiGetBlob).toHaveBeenCalledWith("/vton/tasks/t1/result");
    fireEvent.click(thumbs[0]);
    expect(await screen.findByAltText("Try-on result")).toBeInTheDocument();
  });

  it("flags demo mode and blocks submit until photo and consent are given", async () => {
    render(<TryOnModal {...baseProps} />);
    expect(screen.getByText(/Demo mode/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Try it on" });
    expect(submit).toBeDisabled();
    pickPhoto();
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    await waitFor(() => expect(screen.getByText(/8 of 10 try-ons left/)).toBeInTheDocument());
  });

  it("uploads with consent and idempotency key, then shows the result", async () => {
    api.apiUpload.mockResolvedValue(doneTask);
    api.apiGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    render(<TryOnModal {...baseProps} />);
    pickPhoto();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Try it on" }));

    expect(await screen.findByAltText("Try-on result")).toBeInTheDocument();
    const [path, form, headers] = api.apiUpload.mock.calls[0];
    expect(path).toBe("/vton/tasks");
    expect((form as FormData).get("consent")).toBe("true");
    expect((form as FormData).get("product_id")).toBe("5");
    expect((form as FormData).get("variant_id")).toBe("9");
    expect((form as FormData).get("image_id")).toBe("img-77");
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(api.apiGetBlob).toHaveBeenCalledWith("/vton/tasks/t1/result");
  });

  it("shows a friendly message for a failed task and lets the user retry", async () => {
    api.apiUpload.mockResolvedValue({ ...doneTask, status: "failed", error_code: "no_person_detected", has_result: false });
    render(<TryOnModal {...baseProps} />);
    pickPhoto();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Try it on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not detect a person/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Try it on" })).toBeInTheDocument();
  });

  it("disables the form when the daily quota is exhausted", async () => {
    api.apiGet.mockResolvedValue({ limit: 10, used: 10, remaining: 0, retention_hours: 24 });
    render(<TryOnModal {...baseProps} />);
    expect(await screen.findByRole("button", { name: "No try-ons left today" })).toBeDisabled();
  });
});

describe("TryOnModal long-running generation", () => {
  const running = { ...doneTask, status: "processing" as const, has_result: false };

  it("resumes an in-flight task when the modal is reopened", async () => {
    api.apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/vton/quota")) return { limit: 10, used: 1, remaining: 9, retention_hours: 24 };
      if (path.startsWith("/vton/tasks?")) return { items: [running], total: 1 };
      return { ...doneTask };
    });
    api.apiGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    render(<TryOnModal {...baseProps} />);
    expect(await screen.findByRole("status")).toHaveTextContent(/Creating your try-on|Waiting in queue/);
    expect(await screen.findByAltText("Try-on result", undefined, { timeout: 5000 })).toBeInTheDocument();
  }, 12000);

  it("keeps polling through a transient network error", async () => {
    let polls = 0;
    api.apiUpload.mockResolvedValue({ ...doneTask, status: "queued", has_result: false });
    api.apiGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    api.apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/vton/quota")) return { limit: 10, used: 1, remaining: 9, retention_hours: 24 };
      if (path.startsWith("/vton/tasks?")) return { items: [], total: 0 };
      polls += 1;
      if (polls === 1) throw new TypeError("Failed to fetch");
      return { ...doneTask };
    });
    render(<TryOnModal {...baseProps} />);
    pickPhoto();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Try it on" }));
    expect(await screen.findByAltText("Try-on result", undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(polls).toBeGreaterThanOrEqual(2);
  }, 12000);
});

describe("vtonErrorMessage", () => {
  it("maps known codes and falls back for unknown ones", () => {
    expect(vtonErrorMessage("vton_quota_exceeded")).toMatch(/come back tomorrow/);
    expect(vtonErrorMessage("zzz")).toMatch(/Unable to run/);
  });
});
