import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "u1" } }),
}));
import { GuideProjecteur } from "./GuideProjecteur";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.useRealTimers();
});

async function afficher(onAction = vi.fn()) {
  vi.useFakeTimers();
  const cible = document.createElement("button");
  cible.id = "cible";
  document.body.appendChild(cible);
  const rendu = render(
    <GuideProjecteur
      cle="essai"
      cible="#cible"
      actif
      titre="Étape un"
      texte="Premier texte"
      etapesSuivantes={[{ titre: "Étape deux", texte: "Second texte" }]}
      actionLabel="Essayer maintenant"
      onAction={onAction}
    />,
  );
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
  return rendu;
}

describe("GuideProjecteur en plusieurs étapes", () => {
  it("« Suivant » fait défiler les bulles, l'action n'apparaît qu'à la dernière", async () => {
    const onAction = vi.fn();
    await afficher(onAction);

    expect(screen.getByText("Étape un")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Essayer maintenant" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByText("Étape deux")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Essayer maintenant" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Étape deux")).toBeNull();
  });

  it("vu une fois, il ne reparaît plus pour cet utilisateur", async () => {
    const premier = await afficher();
    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    premier.unmount();

    await afficher();
    expect(screen.queryByText("Étape un")).toBeNull();
  });
});
