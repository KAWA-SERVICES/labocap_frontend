import { describe, expect, it } from "vitest";
import { formaterDate, lignesEnCsv } from "./audit-csv";
import type { LigneAcces } from "./api/audit";

const ligne: LigneAcces = {
  id: "1",
  at: "2026-10-01T08:30:00",
  userId: "u1",
  utilisateur: "Marie Dupont",
  branchId: "b1",
  action: "READ",
  entityType: "REPORT",
  entityId: "7f3c",
  ip: "10.0.0.1",
};

describe("lignesEnCsv", () => {
  it("écrit l'en-tête en français, les libellés traduits, séparés par « ; »", () => {
    const csv = lignesEnCsv([ligne]);
    const [entete, corps] = csv.split("\r\n");
    expect(entete).toBe("Date;Utilisateur;Action;Type;Identifiant;Adresse IP");
    expect(corps).toBe(`${formaterDate(ligne.at)};Marie Dupont;Lecture;Compte rendu;7f3c;10.0.0.1`);
  });

  it("encadre de guillemets un champ contenant le séparateur ou un guillemet", () => {
    const csv = lignesEnCsv([
      { ...ligne, utilisateur: 'Jean "JP" Pierre; dit', action: "DOWNLOAD", entityType: "FILE", entityId: "a/b.pdf" },
    ]);
    expect(csv.split("\r\n")[1]).toContain('"Jean ""JP"" Pierre; dit";Téléchargement;Fichier;a/b.pdf');
  });

  it("ne produit que l'en-tête sans ligne", () => {
    expect(lignesEnCsv([])).toBe("Date;Utilisateur;Action;Type;Identifiant;Adresse IP");
  });
});
