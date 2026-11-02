import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantApi, ErreurAssistant } from "./assistant";

afterEach(() => vi.unstubAllGlobals());

describe("assistantApi.envoyer", () => {
  it("accepte le JSON : un refus avant le flux montre le message du serveur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: "Le quota mensuel de l'assistant est atteint." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const erreur = await assistantApi.envoyer("c1", "Bonjour", () => {}).catch((e) => e);

    expect(fetchMock.mock.calls[0][1].headers.Accept).toContain("application/json");
    expect(erreur).toBeInstanceOf(ErreurAssistant);
    expect(erreur.message).toBe("Le quota mensuel de l'assistant est atteint.");
  });
});
