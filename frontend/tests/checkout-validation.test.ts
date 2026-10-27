import { describe, expect, it } from "vitest";
import { checkoutSchema } from "../lib/validations/checkout";

describe("checkoutSchema validation and normalization", () => {
  it("normalizes phone formats and trims name and address", () => {
    const validCases = [
      {
        fullName: "  Nguyen Van A  ",
        phone: "0912-345-678",
        address: "  123 Le Loi, Phuong Ben Nghe, Quan 1  ",
      },
      {
        fullName: "Nguyen Van B",
        phone: "0912.345.678",
        address: "123 Le Loi, Phuong Ben Nghe, Quan 1",
      },
      {
        fullName: "Nguyen Van C",
        phone: " 0912 345 678 ",
        address: "123 Le Loi, Phuong Ben Nghe, Quan 1",
      },
      {
        fullName: "Nguyen Van D",
        phone: "+84912345678",
        address: "123 Le Loi, Phuong Ben Nghe, Quan 1",
      },
      {
        fullName: "Nguyen Van E",
        phone: "+84 912.345-678",
        address: "123 Le Loi, Phuong Ben Nghe, Quan 1",
      },
    ];

    for (const data of validCases) {
      const parsed = checkoutSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.phone).toBe("0912345678");
        expect(parsed.data.fullName.startsWith(" ")).toBe(false);
        expect(parsed.data.fullName.endsWith(" ")).toBe(false);
        expect(parsed.data.address.startsWith(" ")).toBe(false);
        expect(parsed.data.address.endsWith(" ")).toBe(false);
      }
    }
  });

  it("rejects invalid phone numbers, short names, and short addresses", () => {
    const invalidPhone = checkoutSchema.safeParse({
      fullName: "Valid Name",
      phone: "0123456789", // obsolete 01 prefix, not 03/05/07/08/09
      address: "123 Valid Street, Hanoi",
    });
    expect(invalidPhone.success).toBe(false);

    const lettersPhone = checkoutSchema.safeParse({
      fullName: "Valid Name",
      phone: "0912345abc",
      address: "123 Valid Street, Hanoi",
    });
    expect(lettersPhone.success).toBe(false);

    const shortName = checkoutSchema.safeParse({
      fullName: " A ",
      phone: "0912345678",
      address: "123 Valid Street, Hanoi",
    });
    expect(shortName.success).toBe(false);

    const shortAddress = checkoutSchema.safeParse({
      fullName: "Valid Name",
      phone: "0912345678",
      address: "Short",
    });
    expect(shortAddress.success).toBe(false);
  });
});
