import { describe, expect, it } from "vitest";
import { motifDeModification, texteBrut, versionsCoteACote } from "./report-version";
import type { ReportVersion } from "./api/reports";

describe("motifDeModification", () => {
  it("exige 20 caractères quand le compte rendu est livré", () => {
    const schema = motifDeModification("DELIVERED");
    expect(schema.safeParse("trop court").success).toBe(false);
    expect(schema.safeParse("   ").success).toBe(false);
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse("Correction du diagnostic après relecture").success).toBe(true);
  });

  it("explique le refus en français", () => {
    const r = motifDeModification("DELIVERED").safeParse("court");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/motif d'au moins 20 caractères/);
  });

  it("laisse le motif libre pour un compte rendu non livré", () => {
    for (const status of ["DRAFT", "PENDING_REVIEW", "VALIDATED", undefined] as const) {
      expect(motifDeModification(status).safeParse(undefined).success).toBe(true);
      expect(motifDeModification(status).safeParse("").success).toBe(true);
    }
  });
});

describe("texteBrut", () => {
  it("retire les balises et garde les retours à la ligne", () => {
    expect(texteBrut("<p>Pièce <b>unique</b>&nbsp;:</p><p>3 cm</p>")).toBe("Pièce unique :\n3 cm");
    expect(texteBrut(undefined)).toBe("");
  });
});

describe("versionsCoteACote", () => {
  const v = (n: number, content: string): ReportVersion => ({
    version: n,
    savedAt: "2026-10-01T08:00:00",
    savedBy: "Marie Dupont",
    status: "DELIVERED",
    title: "Biopsie",
    content,
  });

  it("aligne chaque champ, précédente à gauche et choisie à droite", () => {
    const lignes = versionsCoteACote(v(1, "<p>avant</p>"), v(2, "<p>après</p>"));
    const macro = lignes.find((l) => l.label === "Récapitulatif macro");
    expect(macro).toEqual({ label: "Récapitulatif macro", avant: "avant", apres: "après" });
    expect(lignes.find((l) => l.label === "Commentaire")).toEqual({
      label: "Commentaire",
      avant: "",
      apres: "",
    });
  });

  it("laisse la colonne gauche vide sans version précédente", () => {
    const lignes = versionsCoteACote(null, v(1, "seule"));
    expect(lignes.every((l) => l.avant === null)).toBe(true);
    expect(lignes[0]).toEqual({ label: "Titre", avant: null, apres: "Biopsie" });
  });
});
