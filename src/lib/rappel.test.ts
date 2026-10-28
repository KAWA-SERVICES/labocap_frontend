import { describe, expect, it } from "vitest";
import {
  badgeRappel,
  detailRappel,
  ecrireJours,
  estProgramme,
  intervalleSuiviAppel,
  libelleReglagesManquants,
  lireJours,
} from "./rappel";

describe("badgeRappel", () => {
  it("traduit chaque issue et dit « En attente » tant qu'aucun appel n'est parti", () => {
    expect(badgeRappel("PARTIEL")).toMatchObject({ label: "Écoute partielle", variant: "warning" });
    expect(badgeRappel("JOINT").label).toBe("Joint");
    expect(badgeRappel(null)).toEqual({ label: "En attente", variant: "secondary" });
  });
});

describe("detailRappel", () => {
  it("assemble tentatives et part écoutée, en omettant ce qui manque", () => {
    expect(detailRappel({ rappelTentatives: 2, rappelPctEcoute: 40 })).toBe(
      "2 tentatives · 40 % écouté",
    );
    expect(detailRappel({ rappelTentatives: 1 })).toBe("1 tentative");
    expect(detailRappel({})).toBe("");
  });
});

describe("libelleReglagesManquants", () => {
  it("liste les audios manquants et dit à part le service d'appel", () => {
    expect(libelleReglagesManquants(["fluidchat_audio_fon", "fluidchat_audio_bip"])).toBe(
      "audio fon, audio du bip non renseignés",
    );
    expect(libelleReglagesManquants(["fluidchat_api", "fluidchat_audio_fr"])).toBe(
      "service d'appel non configuré sur le serveur ; audio français non renseigné",
    );
    expect(libelleReglagesManquants([])).toBe("");
  });
});

describe("jours de rappel", () => {
  it("relit la valeur stockée et la réécrit triée", () => {
    expect(lireJours(" 5,1, 3,,9,x")).toEqual(new Set([5, 1, 3]));
    expect(ecrireJours(new Set([5, 0, 3]))).toBe("0,3,5");
    expect(ecrireJours(lireJours(""))).toBe("");
  });
});

describe("suivi en direct d'un appel", () => {
  const releve = (issue: "EN_COURS" | "JOINT", result: string | null, attempts: number | null) => ({
    issue,
    result,
    attempts,
  });

  it("interroge vite pendant l'appel, lentement s'il attend sa plage, plus du tout une fois fini", () => {
    expect(intervalleSuiviAppel(undefined)).toBe(5_000);
    expect(intervalleSuiviAppel(releve("EN_COURS", null, 1))).toBe(5_000);
    expect(intervalleSuiviAppel(releve("EN_COURS", null, 0))).toBe(60_000);
    expect(intervalleSuiviAppel(releve("JOINT", "completed", 1))).toBe(false);
  });

  it("ne dit « Programmé » que sans résultat ni tentative", () => {
    expect(estProgramme(releve("EN_COURS", null, null))).toBe(true);
    expect(estProgramme(releve("EN_COURS", "no_answer", 1))).toBe(false);
    expect(estProgramme(undefined)).toBe(false);
  });
});
