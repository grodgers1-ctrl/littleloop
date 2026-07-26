import { describe, expect, it } from "vitest";
import { hasErrors, validateSetup } from "../../src/lib/validation";

describe("validateSetup", () => {
  it("accepts valid input", () => {
    const errors = validateSetup({
      childName: "Ada",
      dateOfBirth: "2024-01-15",
    });
    expect(hasErrors(errors)).toBe(false);
  });

  it("rejects empty name", () => {
    const errors = validateSetup({
      childName: "   ",
      dateOfBirth: "2024-01-15",
    });
    expect(errors.childName).toBeDefined();
  });

  it("rejects too-long name", () => {
    const errors = validateSetup({
      childName: "x".repeat(61),
      dateOfBirth: "2024-01-15",
    });
    expect(errors.childName).toBeDefined();
  });

  it("rejects malformed date", () => {
    const errors = validateSetup({
      childName: "Ada",
      dateOfBirth: "not-a-date",
    });
    expect(errors.dateOfBirth).toBeDefined();
  });

  it("rejects future date of birth", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const errors = validateSetup({
      childName: "Ada",
      dateOfBirth: iso,
    });
    expect(errors.dateOfBirth).toBeDefined();
  });

  it("rejects unrealistic year (<1990)", () => {
    const errors = validateSetup({
      childName: "Ada",
      dateOfBirth: "1980-01-01",
    });
    expect(errors.dateOfBirth).toBeDefined();
  });
});