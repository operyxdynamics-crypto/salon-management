import { describe, expect, it } from "vitest";
import {
  INVOICE_NUMBER_MAX_LENGTH,
  buildInvoiceNumber,
  deriveInvoiceCode,
  financialYearCode,
  normaliseInvoiceCode,
  uniqueInvoiceCode,
} from "./invoice-number";

describe("financialYearCode", () => {
  it("runs April to March", () => {
    expect(financialYearCode(new Date("2025-04-01T06:00:00+05:30"))).toBe("2526");
    expect(financialYearCode(new Date("2026-03-31T23:00:00+05:30"))).toBe("2526");
    expect(financialYearCode(new Date("2026-04-01T06:00:00+05:30"))).toBe("2627");
  });

  it("puts January in the year that started the previous April", () => {
    expect(financialYearCode(new Date("2026-01-15T12:00:00+05:30"))).toBe("2526");
  });
});

describe("buildInvoiceNumber", () => {
  it("pads the serial to five digits", () => {
    expect(buildInvoiceNumber({ code: "WHF", financialYear: "2526", taxMode: "GST", sequence: 1 })).toBe("WHF/2526/00001");
    expect(buildInvoiceNumber({ code: "WHF", financialYear: "2526", taxMode: "GST", sequence: 42 })).toBe("WHF/2526/00042");
  });

  it("keeps GST and non-GST as separate series for the same branch and year", () => {
    const gst = buildInvoiceNumber({ code: "WHF", financialYear: "2526", taxMode: "GST", sequence: 1 });
    const nonGst = buildInvoiceNumber({ code: "WHF", financialYear: "2526", taxMode: "NON_GST", sequence: 1 });
    expect(gst).not.toBe(nonGst);
    expect(nonGst).toBe("WHF/2526/N00001");
  });

  it("stays within the 16 characters GST allows, even at the worst case", () => {
    const worst = buildInvoiceNumber({ code: "WXYZ", financialYear: "2526", taxMode: "NON_GST", sequence: 99999 });
    expect(worst).toBe("WXYZ/2526/N99999");
    expect(worst.length).toBe(INVOICE_NUMBER_MAX_LENGTH);
    expect(worst.length).toBeLessThanOrEqual(INVOICE_NUMBER_MAX_LENGTH);
  });

  it("never emits an empty code", () => {
    expect(buildInvoiceNumber({ code: "!!!", financialYear: "2526", taxMode: "GST", sequence: 1 })).toBe("INV/2526/00001");
  });
});

describe("normaliseInvoiceCode", () => {
  it("uppercases, strips punctuation, and caps length", () => {
    expect(normaliseInvoiceCode("hsr-layout")).toBe("HSRL");
    expect(normaliseInvoiceCode("a b")).toBe("AB");
    expect(normaliseInvoiceCode("!!!")).toBe("");
  });
});

describe("deriveInvoiceCode", () => {
  it("uses initials for multi-word names", () => {
    expect(deriveInvoiceCode("HSR Layout")).toBe("HL");
    expect(deriveInvoiceCode("Whitefield (FOCO)")).toBe("WF");
  });

  it("uses leading letters for single-word names", () => {
    expect(deriveInvoiceCode("Jayanagar")).toBe("JAYA");
  });

  it("always returns something usable", () => {
    expect(deriveInvoiceCode("!!!")).toBe("INV");
    expect(deriveInvoiceCode("")).toBe("INV");
  });
});

describe("uniqueInvoiceCode", () => {
  it("returns the natural code when it is free", () => {
    expect(uniqueInvoiceCode("Jayanagar", [])).toBe("JAYA");
  });

  it("does not hand out a code that is already taken", () => {
    expect(uniqueInvoiceCode("Jayanagar", ["JAYA"])).toBe("JAY2");
    expect(uniqueInvoiceCode("Jayanagar", ["JAYA", "JAY2"])).toBe("JAY3");
  });

  it("is case-insensitive about what is taken", () => {
    expect(uniqueInvoiceCode("Jayanagar", ["jaya"])).toBe("JAY2");
  });

  /**
   * The bug this whole module exists to prevent: four branches whose slugs all began
   * "seed-franchise-" every one collapsed to "SEED" and issued the same invoice number.
   */
  it("gives colliding branch names distinct codes", () => {
    const names = ["Whitefield (FOCO)", "HSR Layout (FOCO)", "Jayanagar (FOFO)", "Malleshwaram (FOFO)"];
    const taken = new Set<string>();
    const codes = names.map((name) => {
      const code = uniqueInvoiceCode(name, taken);
      taken.add(code);
      return code;
    });
    expect(new Set(codes).size).toBe(names.length);
  });

  it("separates branches that share a prefix", () => {
    const taken = new Set<string>();
    for (const name of ["Velvet Glow Andheri", "Velvet Glow Bandra"]) {
      taken.add(uniqueInvoiceCode(name, taken));
    }
    expect(taken.size).toBe(2);
  });
});
