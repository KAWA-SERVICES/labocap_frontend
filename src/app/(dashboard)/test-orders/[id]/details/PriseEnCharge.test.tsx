import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EtapeAffectation } from "@/lib/api/assignments";

const historique = vi.fn();
vi.mock("@/lib/api/assignments", () => ({
  assignmentsApi: { historique: (id: string) => historique(id) },
}));
import { PriseEnCharge } from "./PriseEnCharge";

afterEach(cleanup);

function etape(medecin: string, extra: Partial<EtapeAffectation> = {}): EtapeAffectation {
  return {
    detailId: medecin,
    affectationId: null,
    codeAffectation: null,
    dateAffectation: null,
    medecinId: null,
    medecin,
    confieePar: null,
    confieeLe: null,
    remplaceeLe: null,
    statutDuMedecin: null,
    pourAvis: false,
    ...extra,
  };
}

function afficher(etapes: EtapeAffectation[]) {
  historique.mockResolvedValue({ data: { demandeId: "d1", code: "A1", etapes } });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PriseEnCharge demandeId="d1" />
    </QueryClientProvider>,
  );
}

describe("PriseEnCharge", () => {
  it("affiche le titulaire et, à part, les médecins consultés pour avis", async () => {
    afficher([
      etape("AHOUNOU Marc", { remplaceeLe: "2026-11-04T10:00:00" }),
      etape("KOUASSI Awa"),
      etape("MENSAH Paul", { pourAvis: true }),
      etape("DOSSOU Inès", { pourAvis: true }),
    ]);

    expect((await screen.findByText("Affectée à :")).nextSibling?.textContent).toBe(
      "KOUASSI Awa",
    );
    expect(screen.getByText("Pour avis :").nextSibling?.textContent).toBe(
      "MENSAH Paul, DOSSOU Inès",
    );
  });

  it("un avis seul ne fait pas croire à un transfert", async () => {
    afficher([etape("KOUASSI Awa"), etape("MENSAH Paul", { pourAvis: true })]);

    expect(await screen.findByText("Pour avis :")).toBeTruthy();
    expect(screen.queryByText("Affectée à :")).toBeNull();
  });
});
