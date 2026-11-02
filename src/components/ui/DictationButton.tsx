"use client";

import { useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { Loader2, Mic, Square } from "lucide-react";
import { dicteesApi } from "@/lib/api/dictees";
import { getApiErrorMessage } from "@/lib/api/errorMessages";
import type { ApiError } from "@/types/api";

/** Au-delà, l'enregistrement s'arrête seul : le serveur refuse un segment de plus d'une minute. */
const DUREE_MAX_MS = 60_000;

type Etat = "repos" | "enregistrement" | "transcription";

function messageMicro(err: unknown): string {
  const nom = (err as DOMException)?.name;
  if (nom === "NotAllowedError" || nom === "SecurityError") {
    return "Micro refusé : autorisez-le dans les réglages du navigateur.";
  }
  if (nom === "NotFoundError") return "Aucun micro détecté.";
  return "Impossible d'ouvrir le micro.";
}

/**
 * Bouton de dictée : un clic lance l'enregistrement, un second l'arrête et
 * envoie la phrase à transcrire ; le texte reçu est passé à `onText`.
 *
 * Une phrase = un segment court (≤ 60 s) : le texte arrive une ou deux
 * secondes après l'arrêt, sans connexion ouverte en continu.
 */
export function DictationButton({ onText }: { onText: (texte: string) => void }) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const enregistreur = useRef<MediaRecorder | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quitter la page en pleine dictée coupe le micro (sinon le voyant reste allumé).
  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
      const r = enregistreur.current;
      if (r) {
        r.onstop = null;
        if (r.state !== "inactive") r.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
    },
    []
  );

  const arreter = () => {
    if (minuterie.current) clearTimeout(minuterie.current);
    const r = enregistreur.current;
    if (r && r.state !== "inactive") r.stop();
  };

  const demarrer = async () => {
    setErreur(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErreur("La dictée n'est pas prise en charge par ce navigateur.");
      return;
    }
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setErreur(messageMicro(e));
      return;
    }
    // Opus en webm (Chrome, Firefox) ; Safari choisit seul son format (mp4).
    const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
    const r = new MediaRecorder(flux, { mimeType: type, audioBitsPerSecond: 24_000 });
    const morceaux: Blob[] = [];
    r.ondataavailable = (ev) => {
      if (ev.data.size > 0) morceaux.push(ev.data);
    };
    r.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      enregistreur.current = null;
      const audio = new Blob(morceaux, { type: r.mimeType || "audio/webm" });
      if (audio.size === 0) {
        setEtat("repos");
        return;
      }
      setEtat("transcription");
      try {
        const { data } = await dicteesApi.transcrire(audio);
        if (data.texte) onText(data.texte);
      } catch (e) {
        setErreur(getApiErrorMessage(e as AxiosError<ApiError>, "La transcription a échoué. Réessayez."));
      } finally {
        setEtat("repos");
      }
    };
    enregistreur.current = r;
    r.start();
    setEtat("enregistrement");
    minuterie.current = setTimeout(arreter, DUREE_MAX_MS);
  };

  const enregistre = etat === "enregistrement";
  const libelle = enregistre
    ? "Arrêter et insérer le texte"
    : etat === "transcription"
      ? "Transcription en cours…"
      : "Dicter (cliquez, parlez, recliquez)";

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        title={libelle}
        aria-label={libelle}
        aria-pressed={enregistre}
        disabled={etat === "transcription"}
        // onMouseDown + preventDefault : le curseur reste dans le texte, là où la phrase sera insérée.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (enregistre ? arreter() : demarrer())}
        className={`rounded-[var(--radius-control)] p-1.5 transition-colors disabled:cursor-wait ${
          enregistre
            ? "animate-pulse bg-red-100 text-red-700 ring-1 ring-inset ring-red-300"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        {etat === "transcription" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enregistre ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {erreur && (
        <span role="alert" className="text-xs text-red-600">
          {erreur}
        </span>
      )}
    </span>
  );
}
