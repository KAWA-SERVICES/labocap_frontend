import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

vi.mock("@/lib/api/dictees", () => ({ dicteesApi: { transcrire: vi.fn() } }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
import { dicteesApi } from "@/lib/api/dictees";
import { toast } from "sonner";
import { DictationButton } from "./DictationButton";

const pisteArretee = vi.fn();
/** Niveau sonore que l'analyseur renvoie : 0 = silence, 0.1 = quelqu'un parle. */
let niveauMicro = 0;
let numeroSegment = 0;

/** MediaRecorder minimal : chaque segment porte son numéro, stop() le livre puis déclenche onstop. */
class FauxEnregistreur {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((ev: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  numero = ++numeroSegment;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
    queueMicrotask(() => this.onstart?.());
  }
  stop() {
    this.state = "inactive";
    // La taille du morceau porte le numéro du segment : on retrouve qui a été envoyé.
    const data = new Blob(["x".repeat(this.numero)], { type: this.mimeType });
    this.ondataavailable?.({ data });
    this.onstop?.();
  }
}

class FauxAudioContext {
  currentTime = 0;
  destination = {};
  resume = () => Promise.resolve();
  close = () => Promise.resolve();
  createAnalyser = () => ({
    fftSize: 1024,
    getFloatTimeDomainData: (tampon: Float32Array) => tampon.fill(niveauMicro),
  });
  createMediaStreamSource = () => ({ connect: () => {} });
  createGain = () => ({ gain: { value: 0 }, connect: (x: unknown) => x });
  createOscillator = () => ({
    frequency: { value: 0 },
    connect: () => ({ connect: () => {} }),
    start: () => {},
    stop: () => {},
  });
}

const fluxMicro = () => ({
  getTracks: () => [{ stop: pisteArretee }],
  getAudioTracks: () => [],
});

function installerMicro(
  getUserMedia: () => Promise<unknown> = async () => fluxMicro(),
) {
  vi.stubGlobal("MediaRecorder", FauxEnregistreur);
  vi.stubGlobal("AudioContext", FauxAudioContext);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

const reponse = (texte: string, minutesRestantes = 500) =>
  ({ data: { texte, minutesRestantes } }) as never;

async function attendre(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function parler(ms: number) {
  niveauMicro = 0.1;
  await attendre(ms);
  niveauMicro = 0;
}

async function demarrer() {
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /Dicter/ })),
  );
  await attendre(0);
}

/** Numéro du segment audio envoyé à l'appel n (1 = premier enregistreur créé). */
function segmentEnvoye(n: number): number {
  return vi.mocked(dicteesApi.transcrire).mock.calls[n][0].size;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  niveauMicro = 0;
  numeroSegment = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DictationButton", () => {
  it("clic, parole, Échap : la phrase part, le texte revient, le micro est coupé", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire).mockResolvedValue(
      reponse("Carcinome canalaire."),
    );
    const onText = vi.fn();
    const onEnregistrement = vi.fn();
    render(
      <DictationButton onText={onText} onEnregistrement={onEnregistrement} />,
    );

    await demarrer();
    expect(screen.getByText("Micro ouvert — parlez")).toBeTruthy();
    expect(onEnregistrement).toHaveBeenLastCalledWith(true);

    await parler(500);
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    await attendre(0);

    expect(dicteesApi.transcrire).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("Carcinome canalaire.");
    expect(onEnregistrement).toHaveBeenLastCalledWith(false);
    expect(pisteArretee).toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: /Dicter/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("chaque pause envoie la phrase pendant qu'on parle ; l'ordre de la parole est gardé", async () => {
    installerMicro();
    let rendrePremiere!: (v: unknown) => void;
    vi.mocked(dicteesApi.transcrire)
      .mockReturnValueOnce(new Promise((r) => (rendrePremiere = r)) as never)
      .mockResolvedValueOnce(reponse("Deuxième phrase."));
    const onText = vi.fn();
    render(<DictationButton onText={onText} />);

    await demarrer();
    await parler(600);
    await attendre(1000); // pause : la première phrase part
    expect(dicteesApi.transcrire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Arrêter/ })).toBeTruthy(); // on dicte toujours

    await parler(600);
    await attendre(1000); // seconde phrase partie, sa réponse arrive avant la première
    expect(dicteesApi.transcrire).toHaveBeenCalledTimes(2);
    expect(segmentEnvoye(0)).toBe(1);
    expect(segmentEnvoye(1)).toBe(2);
    expect(onText).not.toHaveBeenCalled();

    await act(async () => rendrePremiere(reponse("Première phrase.")));
    await attendre(0);
    expect(onText.mock.calls.map((c) => c[0])).toEqual([
      "Première phrase.",
      "Deuxième phrase.",
    ]);
  });

  it("du silence seul n'est jamais envoyé (ni facturé)", async () => {
    installerMicro();
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await attendre(15_000);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Arrêter/ })),
    );
    await attendre(0);

    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
  });

  it("une phrase plus longue que 55 s est coupée avant la limite du serveur", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire).mockResolvedValue(reponse("…"));
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(56_000);

    expect(dicteesApi.transcrire).toHaveBeenCalledTimes(1);
  });

  it("deux minutes sans un mot : le micro se coupe seul", async () => {
    installerMicro();
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await attendre(121_000);

    expect(pisteArretee).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "Dictée arrêtée après 2 minutes de silence.",
    );
    expect(screen.getByRole("button", { name: /Dicter/ })).toBeTruthy();
  });

  it("micro refusé : notification avec la marche à suivre, rien n'est envoyé", async () => {
    installerMicro(() =>
      Promise.reject(new DOMException("non", "NotAllowedError")),
    );
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();

    expect(toast.error).toHaveBeenCalledWith(
      "Micro bloqué ou indisponible",
      expect.objectContaining({
        description: expect.stringContaining("cadenas"),
      }),
    );
    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Dicter/ })).toBeTruthy();
  });

  it("phrase en échec : la dictée continue et « Renvoyer la phrase » renvoie le même audio", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { message: "Service indisponible" } },
      })
      .mockResolvedValueOnce(reponse("Rattrapée."));
    const onText = vi.fn();
    render(<DictationButton onText={onText} />);

    await demarrer();
    await parler(500);
    await attendre(1000);

    expect(screen.getByRole("button", { name: /Arrêter/ })).toBeTruthy();
    const options = vi.mocked(toast.error).mock.calls[0][1] as unknown as {
      action: { onClick: () => void };
    };
    await act(async () => options.action.onClick());
    await attendre(0);

    expect(segmentEnvoye(1)).toBe(segmentEnvoye(0));
    expect(onText).toHaveBeenCalledWith("Rattrapée.");
  });

  it("quota atteint : la dictée s'arrête, le message du serveur est traduit", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "DICTEE_QUOTA_ATTEINT" } },
    });
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(500);
    await attendre(1000);

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Quota mensuel de dictée atteint"),
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: /Dicter/ })).toBeTruthy();
    expect(pisteArretee).toHaveBeenCalled();
    await parler(500);
    await attendre(1000);
    expect(dicteesApi.transcrire).toHaveBeenCalledTimes(1);
  });

  it("moins d'une heure de quota : l'agence est prévenue une fois", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire).mockResolvedValue(reponse("Texte.", 42));
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(500);
    await attendre(1000);
    await parler(500);
    await attendre(1000);

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      "Quota de dictée bientôt atteint",
      expect.objectContaining({
        description: expect.stringContaining("42 min"),
      }),
    );
  });
  it("60 min restantes ou plus : pas d'alerte de quota", async () => {
    installerMicro();
    vi.mocked(dicteesApi.transcrire).mockResolvedValue(reponse("T.", 60));
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(500);
    await attendre(1000);

    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("une toux ou des clics épars ne font pas une phrase", async () => {
    installerMicro();
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(150);
    await attendre(1500);
    await parler(150); // 300 ms au total, mais séparées par un silence
    await attendre(1500);

    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
  });

  it("page quittée pendant la demande d'accès au micro : le micro est rendu, rien ne tourne", async () => {
    let ouvrir!: (f: unknown) => void;
    installerMicro(() => new Promise((r) => (ouvrir = r)));
    const { unmount } = render(<DictationButton onText={vi.fn()} />);

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Dicter/ })),
    );
    unmount();
    await act(async () => ouvrir(fluxMicro()));
    niveauMicro = 0.1;
    await attendre(60_000);

    expect(pisteArretee).toHaveBeenCalled();
    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
  });

  it("page quittée en pleine dictée : micro coupé, phrase en cours non envoyée", async () => {
    installerMicro();
    const { unmount } = render(<DictationButton onText={vi.fn()} />);

    await demarrer();
    await parler(500);
    unmount();
    await attendre(0);

    expect(pisteArretee).toHaveBeenCalled();
    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
  });

  it("une seule dictée à la fois : le second champ est refusé", async () => {
    installerMicro();
    render(
      <>
        <DictationButton onText={vi.fn()} />
        <DictationButton onText={vi.fn()} />
      </>,
    );

    const [premier, second] = screen.getAllByRole("button", { name: /Dicter/ });
    await act(async () => fireEvent.click(premier));
    await attendre(0);
    await act(async () => fireEvent.click(second));

    expect(toast.info).toHaveBeenCalledWith(
      "Une dictée est déjà en cours dans un autre champ.",
    );
    expect(screen.getAllByRole("button", { name: /Arrêter/ })).toHaveLength(1);
  });

  it("après l'arrêt, « Insertion… » tant que des phrases sont en route", async () => {
    installerMicro();
    let rendre!: (v: unknown) => void;
    vi.mocked(dicteesApi.transcrire).mockReturnValueOnce(
      new Promise((r) => (rendre = r)) as never,
    );
    const onEnAttente = vi.fn();
    render(<DictationButton onText={vi.fn()} onEnAttente={onEnAttente} />);

    await demarrer();
    await parler(500);
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    await attendre(0);

    const bouton = screen.getByRole("button", { name: /Insertion/ });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(onEnAttente).toHaveBeenLastCalledWith(1);

    await act(async () => rendre(reponse("Fin.")));
    await attendre(0);
    expect(screen.getByRole("button", { name: /Dicter/ })).toBeTruthy();
    expect(onEnAttente).toHaveBeenLastCalledWith(0);
  });

  it("navigateur sans enregistrement audio : message clair, micro jamais demandé", async () => {
    const getUserMedia = vi.fn();
    installerMicro(getUserMedia);
    vi.stubGlobal("AudioContext", undefined);
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();

    expect(toast.error).toHaveBeenCalledWith(
      "La dictée n'est pas prise en charge par ce navigateur.",
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("l'enregistreur refuse de démarrer : micro rendu, bouton de nouveau utilisable", async () => {
    installerMicro();
    vi.stubGlobal(
      "MediaRecorder",
      class extends FauxEnregistreur {
        start() {
          throw new Error("NotSupportedError");
        }
      },
    );
    render(<DictationButton onText={vi.fn()} />);

    await demarrer();

    expect(pisteArretee).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "L'enregistrement n'a pas pu démarrer sur ce navigateur.",
    );
    expect(screen.getByRole("button", { name: /Dicter/ })).toBeTruthy();
  });
  it("fermer l'onglet pendant la dictée demande confirmation, pas au repos", async () => {
    installerMicro();
    render(<DictationButton onText={vi.fn()} />);
    const depart = () => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };

    expect(depart()).toBe(false);
    await demarrer();
    expect(depart()).toBe(true);
    await act(async () => fireEvent.keyDown(document, { key: "Escape" }));
    await attendre(0);
    expect(depart()).toBe(false);
  });
});
