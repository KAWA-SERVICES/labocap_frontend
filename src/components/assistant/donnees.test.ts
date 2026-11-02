import { describe, expect, it } from "vitest";
import { cheminAutorise, formeDesDonnees, humaniser } from "./donnees";

const ID = "3f2b1c4d-5e6f-4a1b-9c8d-7e6f5a4b3c2d";

describe("formeDesDonnees", () => {
  it("fait un tableau d'une liste d'objets, sans les identifiants, lien sur le code", () => {
    const f = formeDesDonnees([{ id: ID, testOrderId: ID, code: "B26-1", examen: "Biopsie", urgent: true }]);
    expect(f?.colonnes).toEqual(["Code", "Examen", "Urgent"]);
    expect(f?.lignes[0]).toEqual([
      { texte: "B26-1", lien: `/test-orders/${ID}` },
      { texte: "Biopsie", lien: undefined },
      { texte: "Oui", lien: undefined },
    ]);
  });

  it("fait des tuiles des compteurs et garde la liste qui les accompagne", () => {
    const f = formeDesDonnees({ aTraiter: 12, enRetard: 3, dossiers: [{ code: "B26-2", reportId: ID }] });
    expect(f?.tuiles).toEqual([
      { libelle: "A traiter", valeur: "12" },
      { libelle: "En retard", valeur: "3" },
    ]);
    expect(f?.lignes[0][0].lien).toBe(`/reports/${ID}`);
  });

  it("ne montre rien pour un texte ou un objet sans compteur", () => {
    expect(formeDesDonnees("ok")).toBeNull();
    expect(formeDesDonnees({ statut: "VALIDATED" })).toBeNull();
  });
});

describe("cheminAutorise", () => {
  it("n'accepte que l'ouverture d'un compte rendu", () => {
    expect(cheminAutorise({ naviguer: `/reports/${ID}` })).toBe(`/reports/${ID}`);
    expect(cheminAutorise({ naviguer: "https://ailleurs.example/reports/x" })).toBeNull();
    expect(cheminAutorise({ naviguer: `/settings/users` })).toBeNull();
    expect(cheminAutorise(undefined)).toBeNull();
  });
});

it("humaniser", () => {
  expect(humaniser("dateDuLot")).toBe("Date du lot");
});
