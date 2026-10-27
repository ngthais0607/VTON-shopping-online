import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";


describe("VietQR payment copy", () => {
  it("does not promise automatic payment reconciliation", () => {
    const sourceFiles = [
      "app/store/components/VietQRModal.tsx",
      "app/store/orders/[id]/page.tsx",
      "app/store/blog/page.tsx",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8"));

    const combinedCopy = sourceFiles.join("\n");
    expect(combinedCopy).not.toMatch(/verified automatically/i);
    expect(combinedCopy).not.toMatch(/reconcile automatically/i);
    expect(combinedCopy).not.toMatch(/banking webhooks/i);
    expect(combinedCopy).toMatch(/administrator verifies/i);
  });
});
