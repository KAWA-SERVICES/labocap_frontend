import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppliMobile, LIEN_APK } from "./AppliMobile";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function afficher(reponse: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reponse));
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppliMobile />
    </QueryClientProvider>,
  );
}

describe("AppliMobile", () => {
  it("affiche la version publiée et le lien de l'APK", async () => {
    afficher(
      new Response(JSON.stringify({ version: "1.0.0", build: 14, date: "2026-11-09" }), {
        status: 200,
      }),
    );

    expect(await screen.findByText(/build 14/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Télécharger/ }).getAttribute("href")).toBe(LIEN_APK);
  });

  it("ne montre rien tant qu'aucune version n'est publiée", async () => {
    const { container } = afficher(new Response("introuvable", { status: 404 }));

    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });
});
