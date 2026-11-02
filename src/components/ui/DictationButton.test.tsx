import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/dictees", () => ({ dicteesApi: { transcrire: vi.fn() } }));
import { dicteesApi } from "@/lib/api/dictees";
import { DictationButton } from "./DictationButton";

const pisteArretee = vi.fn();

/** MediaRecorder minimal : stop() livre un morceau audio puis déclenche onstop. */
class FauxEnregistreur {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((ev: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["son"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function installerMicro(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal("MediaRecorder", FauxEnregistreur);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DictationButton", () => {
  it("clic, parole, reclic : le segment part au serveur, le texte revient, le micro est coupé", async () => {
    installerMicro(async () => ({ getTracks: () => [{ stop: pisteArretee }] }));
    vi.mocked(dicteesApi.transcrire).mockResolvedValue({ data: { texte: "Carcinome canalaire." } } as never);
    const onText = vi.fn();
    render(<DictationButton onText={onText} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Dicter/ })));
    expect(screen.getByRole("button", { name: /Arrêter/ }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Arrêter/ })));

    await waitFor(() => expect(onText).toHaveBeenCalledWith("Carcinome canalaire."));
    expect(vi.mocked(dicteesApi.transcrire).mock.calls[0][0].type).toBe("audio/webm;codecs=opus");
    expect(pisteArretee).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Dicter/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("micro refusé : message clair, rien n'est envoyé", async () => {
    installerMicro(() => Promise.reject(new DOMException("non", "NotAllowedError")));
    render(<DictationButton onText={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Dicter/ })));

    expect(screen.getByRole("alert").textContent).toContain("Micro refusé");
    expect(dicteesApi.transcrire).not.toHaveBeenCalled();
  });

  it("quota atteint : le message du serveur est traduit", async () => {
    installerMicro(async () => ({ getTracks: () => [] }));
    vi.mocked(dicteesApi.transcrire).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "DICTEE_QUOTA_ATTEINT" } },
    });
    render(<DictationButton onText={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Dicter/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Arrêter/ })));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Quota mensuel de dictée atteint"));
  });
});
