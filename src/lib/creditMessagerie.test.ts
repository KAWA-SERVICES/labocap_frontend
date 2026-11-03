import { describe, expect, it } from "vitest";
import {
  erreurMontant,
  erreurTelephone,
  formatDuree,
  libelleOffre,
  moisProposes,
  montantForfait,
  derniersMois,
  detailMouvement,
  libelleMouvement,
  mouvementsCsv,
  totauxMois,
  type MouvementCredit,
} from "./creditMessagerie";

describe("erreurMontant", () => {
  it("accepte les bornes et refuse hors bornes ou décimales", () => {
    expect(erreurMontant(1_000)).toBeNull();
    expect(erreurMontant(2_000_000)).toBeNull();
    expect(erreurMontant(999)).not.toBeNull();
    expect(erreurMontant(2_000_001)).not.toBeNull();
    expect(erreurMontant(1_500.5)).not.toBeNull();
    expect(erreurMontant(Number.NaN)).not.toBeNull();
  });
});

describe("moisProposes", () => {
  it("impose 3 mois au premier achat du forfait, puis laisse 1 mois", () => {
    expect(moisProposes(null)).toEqual([3, 6, 12]);
    expect(moisProposes("2026-12-31")).toEqual([1, 3, 6, 12]);
  });
});

describe("montantForfait", () => {
  it("multiplie le prix mensuel", () => {
    expect(montantForfait(3, 44_870)).toBe(134_610);
  });
});

describe("formatDuree", () => {
  it("écrit minutes:secondes, puis heures au-delà", () => {
    expect(formatDuree(0)).toBe("0:00");
    expect(formatDuree(75)).toBe("1:15");
    expect(formatDuree(3725)).toBe("1:02:05");
  });
});

describe("erreurTelephone", () => {
  it("accepte 8 ou 10 chiffres, avec ou sans indicatif ni séparateurs", () => {
    expect(erreurTelephone("97000001")).toBeNull();
    expect(erreurTelephone("01 97 00 00 01")).toBeNull();
    expect(erreurTelephone("+229 01 97 00 00 01")).toBeNull();
    expect(erreurTelephone("002290197000001")).toBeNull();
    expect(erreurTelephone("12345")).not.toBeNull();
    expect(erreurTelephone("0297000001")).not.toBeNull();
  });
});

describe("libelleOffre", () => {
  it("nomme les trois cas", () => {
    expect(libelleOffre("unit")).toBe("À l'unité");
    expect(libelleOffre("unlimited")).toBe("Forfait illimité");
    expect(libelleOffre("none")).toBe("Non activé");
  });
});

describe("historique du crédit", () => {
  const l = (p: Partial<MouvementCredit>): MouvementCredit => ({
    id: 1, type: "sms", montantFcfa: -24, unites: 1, note: "", soldeApres: 0, le: "2026-11-03T08:00:00Z", ...p,
  });

  it("libellés et détails par type", () => {
    expect(libelleMouvement("topup")).toBe("Recharge");
    expect(libelleMouvement("manual")).toBe("Ajustement");
    expect(detailMouvement(l({ unites: 2 }))).toBe("2 unités");
    expect(detailMouvement(l({ type: "call", unites: 535, note: "Rattrapage" }))).toBe("8:55 · Rattrapage");
    expect(detailMouvement(l({ type: "manual", note: "Geste commercial" }))).toBe("Geste commercial");
  });

  it("douze mois glissants, mois en cours d'abord, à cheval sur l'année", () => {
    const m = derniersMois(new Date(2026, 0, 15));
    expect(m[0]).toBe("2026-01");
    expect(m[1]).toBe("2025-12");
    expect(m).toHaveLength(12);
  });

  it("totaux du mois", () => {
    expect(totauxMois([l({ montantFcfa: 10000 }), l({}), l({ type: "call", montantFcfa: -1605 })]))
      .toEqual({ debits: 1629, credits: 10000 });
  });

  it("CSV pour Excel : BOM, « ; », guillemets échappés", () => {
    const csv = mouvementsCsv([l({ type: "manual", montantFcfa: -2397, note: 'Rattrapage ; "02/11"' })]);
    expect(csv.startsWith("﻿Date;Type;")).toBe(true);
    expect(csv).toContain('Ajustement;"Rattrapage ; ""02/11""";-2397;0');
  });
});
