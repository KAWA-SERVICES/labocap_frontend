import { describe, expect, it } from "vitest";
import { forceMotDePasse, motDePasseSchema } from "./mot-de-passe";

describe("forceMotDePasse", () => {
  it("faible sous 12 caractères", () => {
    expect(forceMotDePasse("")).toBe("faible");
    expect(forceMotDePasse("Abc123!abcd")).toBe("faible");
  });

  it("moyen à partir de 12 caractères, ou long mais d'une seule classe", () => {
    expect(forceMotDePasse("abcdefghijkl")).toBe("moyen");
    expect(forceMotDePasse("abcdefghijklmnopqrst")).toBe("moyen");
  });

  it("fort à partir de 16 caractères et deux classes", () => {
    expect(forceMotDePasse("abcdefghijklmno1")).toBe("fort");
    expect(forceMotDePasse("abcd efgh ijkl mnop")).toBe("fort");
  });
});

describe("motDePasseSchema", () => {
  it("refuse en français sous 12 caractères", () => {
    const r = motDePasseSchema.safeParse("court");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("12 caractères");
    expect(motDePasseSchema.safeParse("abcdefghijkl").success).toBe(true);
  });
});
