"use client";

import { useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { Loader2, Mic } from "lucide-react";
import { dicteesApi } from "@/lib/api/dictees";
import { getApiErrorMessage } from "@/lib/api/errorMessages";
import type { ApiError } from "@/types/api";

/**
 * Niveau sonore (RMS, 0 à 1) au-dessus duquel on entend de la voix.
 * ponytail: seuil fixe ; si une salle bruyante empêche les coupures, mesurer le
 * bruit de fond pendant la préparation et placer le seuil au-dessus.
 */
const SEUIL_VOIX = 0.015;
/** Une pause de cette durée termine la phrase : elle part à la transcription. */
const PAUSE_FIN_PHRASE_MS = 900;
/** En dessous, c'est une toux ou un clic : le segment n'est pas envoyé (ni facturé). */
const VOIX_MIN_MS = 250;
/** Le serveur refuse un segment de plus de 60 s : on coupe avant. */
const SEGMENT_MAX_MS = 55_000;
/** Sans un mot pendant ce temps, le micro se coupe seul. */
const SILENCE_ARRET_MS = 120_000;
/** Un segment muet est jeté et recommencé au-delà de cette durée, pour rester court. */
const SEGMENT_MUET_MAX_MS = 10_000;
const PAS_MS = 50;
/** Sous ce reste mensuel, l'agence est prévenue. */
const ALERTE_QUOTA_MINUTES = 60;

type Etat = "repos" | "preparation" | "enregistrement";

/** Une seule dictée à la fois sur la page : deux micros se voleraient le curseur. */
let dicteeEnCours = false;

interface Session {
  flux: MediaStream;
  audio: AudioContext;
  analyseur: AnalyserNode;
  echantillons: Float32Array<ArrayBuffer>;
  minuterie: ReturnType<typeof setInterval>;
  debut: number;
  segment: { enregistreur: MediaRecorder; morceaux: Blob[] } | null;
  debutSegment: number;
  voixMs: number;
  derniereVoix: number;
  derniereVoixSession: number;
}

function messageMicro(err: unknown): string {
  const nom = (err as DOMException)?.name;
  if (nom === "NotAllowedError" || nom === "SecurityError") {
    return "Cliquez sur le cadenas à gauche de l'adresse, puis Micro → Autoriser.";
  }
  if (nom === "NotFoundError") return "Aucun micro détecté sur cet ordinateur.";
  return "Le micro n'a pas pu être ouvert.";
}

function estQuotaAtteint(err: unknown): boolean {
  return (
    (err as AxiosError<ApiError>)?.response?.data?.message ===
    "DICTEE_QUOTA_ATTEINT"
  );
}

/** Bip court : le micro enregistre vraiment, on peut parler. */
function bip(audio: AudioContext) {
  try {
    const oscillateur = audio.createOscillator();
    const volume = audio.createGain();
    oscillateur.frequency.value = 880;
    volume.gain.value = 0.08;
    oscillateur.connect(volume).connect(audio.destination);
    oscillateur.start();
    oscillateur.stop(audio.currentTime + 0.12);
  } catch {
    // Sans bip, le libellé « Micro ouvert — parlez » suffit.
  }
}

function chrono(secondes: number): string {
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
}

interface Props {
  /** Texte d'une phrase transcrite, dans l'ordre où les phrases ont été dites. */
  onText: (texte: string) => void;
  /** Vrai pendant l'enregistrement (l'éditeur passe son cadre en rouge). */
  onEnregistrement?: (actif: boolean) => void;
  /** Nombre de phrases parties dont le texte n'est pas encore revenu. */
  onEnAttente?: (n: number) => void;
}

/**
 * Dictée continue : un clic ouvre le micro, chaque pause d'environ une seconde
 * envoie la phrase à transcrire pendant qu'on continue de parler ; Échap ou un
 * second clic arrête.
 *
 * Chaque phrase est un enregistrement court et autonome (pas de connexion
 * ouverte en continu, pas de modèle temps réel). Les requêtes partent en
 * parallèle mais le texte est inséré dans l'ordre de la parole.
 */
export function DictationButton({
  onText,
  onEnregistrement,
  onEnAttente,
}: Props) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [enAttente, setEnAttente] = useState(0);
  const [niveau, setNiveau] = useState(0);
  const [duree, setDuree] = useState(0);
  const session = useRef<Session | null>(null);
  const file = useRef<Promise<void>>(Promise.resolve());
  const quotaSignale = useRef(false);
  const monte = useRef(true);
  const notifications = useRef<Set<string | number>>(new Set());

  // Rappels toujours à jour sans relancer les effets ni recréer la session.
  const rappels = useRef({ onText, onEnregistrement, onEnAttente });
  useEffect(() => {
    rappels.current = { onText, onEnregistrement, onEnAttente };
  });

  useEffect(() => {
    rappels.current.onEnAttente?.(enAttente);
  }, [enAttente]);

  const compter = (delta: number) => setEnAttente((n) => n + delta);

  const envoyer = (audio: Blob) => {
    const requete = dicteesApi.transcrire(audio);
    requete.catch(() => {}); // traitée dans la file, dans l'ordre
    compter(1);
    file.current = file.current.then(async () => {
      try {
        const { data } = await requete;
        if (data.texte) rappels.current.onText(data.texte);
        if (
          data.minutesRestantes >= 0 &&
          data.minutesRestantes < ALERTE_QUOTA_MINUTES &&
          !quotaSignale.current
        ) {
          quotaSignale.current = true;
          toast.warning("Quota de dictée bientôt atteint", {
            id: "dictee-quota-bas",
            description: `Il reste ${data.minutesRestantes} min ce mois-ci pour l'agence.`,
          });
        }
      } catch (e) {
        const message = getApiErrorMessage(
          e as AxiosError<ApiError>,
          "Le service de transcription n'a pas répondu.",
        );
        if (estQuotaAtteint(e)) {
          arreter();
          toast.error(message, { id: "dictee-quota-atteint" });
        } else {
          const id = toast.error("Une phrase n'a pas pu être transcrite", {
            description: `${message} La dictée continue.`,
            duration: 5 * 60_000,
            action: {
              label: "Renvoyer la phrase",
              onClick: () => {
                notifications.current.delete(id);
                envoyer(audio);
              },
            },
          });
          notifications.current.add(id);
        }
      } finally {
        compter(-1);
      }
    });
  };

  /** Arrête le segment en cours ; `garder` l'envoie, sinon il est jeté. */
  const couperSegment = (s: Session, garder: boolean, puis?: () => void) => {
    const seg = s.segment;
    s.segment = null;
    if (!seg) {
      puis?.();
      return;
    }
    const { enregistreur: r, morceaux } = seg;
    r.onstop = () => {
      const audio = new Blob(morceaux, { type: r.mimeType || "audio/webm" });
      if (garder && audio.size > 0) envoyer(audio);
      puis?.();
    };
    if (r.state !== "inactive") r.stop();
    else r.onstop(new Event("stop"));
  };

  const nouveauSegment = (s: Session, auDemarrage?: () => void) => {
    // Opus en webm (Chrome, Firefox) ; Safari choisit seul son format (mp4).
    const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : undefined;
    const r = new MediaRecorder(s.flux, {
      mimeType: type,
      audioBitsPerSecond: 24_000,
    });
    const morceaux: Blob[] = [];
    r.ondataavailable = (ev) => {
      if (ev.data.size > 0) morceaux.push(ev.data);
    };
    if (auDemarrage) r.onstart = auDemarrage;
    s.segment = { enregistreur: r, morceaux };
    s.debutSegment = performance.now();
    s.voixMs = 0;
    s.derniereVoix = 0;
    r.start();
  };

  const tic = () => {
    const s = session.current;
    if (!s) return;
    const maintenant = performance.now();
    s.analyseur.getFloatTimeDomainData(s.echantillons);
    let somme = 0;
    for (const v of s.echantillons) somme += v * v;
    const rms = Math.sqrt(somme / s.echantillons.length);

    setNiveau(Math.min(4, Math.round(rms * 120)));
    setDuree(Math.floor((maintenant - s.debut) / 1000));

    if (rms > SEUIL_VOIX) {
      s.voixMs += PAS_MS;
      s.derniereVoix = maintenant;
      s.derniereVoixSession = maintenant;
    }

    if (maintenant - s.derniereVoixSession > SILENCE_ARRET_MS) {
      arreter();
      toast.info("Dictée arrêtée après 2 minutes de silence.");
      return;
    }

    const age = maintenant - s.debutSegment;
    const enPause = maintenant - s.derniereVoix > PAUSE_FIN_PHRASE_MS;
    const phrase = s.voixMs >= VOIX_MIN_MS;
    if (
      (phrase && enPause) ||
      age > SEGMENT_MAX_MS ||
      (enPause && age > SEGMENT_MUET_MAX_MS)
    ) {
      couperSegment(s, phrase); // sans phrase, le segment est jeté
      try {
        nouveauSegment(s);
      } catch {
        arreter();
        toast.error("Le micro s'est arrêté. Relancez la dictée.");
      }
    } else if (enPause) {
      // Des clics ou une porte, séparés par des silences, ne font pas une phrase.
      s.voixMs = 0;
    }
  };

  const liberer = (s: Session) => {
    clearInterval(s.minuterie);
    s.flux.getTracks().forEach((t) => t.stop());
    s.audio.close().catch(() => {});
  };

  function arreter() {
    const s = session.current;
    if (!s) return;
    session.current = null;
    dicteeEnCours = false;
    clearInterval(s.minuterie);
    couperSegment(s, s.voixMs >= VOIX_MIN_MS, () => liberer(s));
    setEtat("repos");
    setNiveau(0);
    rappels.current.onEnregistrement?.(false);
  }

  const demarrer = async () => {
    if (dicteeEnCours) {
      toast.info("Une dictée est déjà en cours dans un autre champ.");
      return;
    }
    if (
      typeof MediaRecorder === "undefined" ||
      typeof AudioContext === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      toast.error("La dictée n'est pas prise en charge par ce navigateur.");
      return;
    }
    dicteeEnCours = true;
    setEtat("preparation");
    // Créé et relancé dans le clic : après l'attente du micro, le navigateur
    // pourrait le laisser suspendu, et l'analyseur n'entendrait que du silence.
    const audio = new AudioContext();
    audio.resume().catch(() => {});
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      dicteeEnCours = false;
      audio.close().catch(() => {});
      if (!monte.current) return;
      setEtat("repos");
      toast.error("Micro bloqué ou indisponible", {
        description: messageMicro(e),
        action: { label: "Réessayer", onClick: () => void demarrer() },
      });
      return;
    }
    if (!monte.current) {
      // Page quittée pendant la demande d'accès : on rend le micro aussitôt.
      dicteeEnCours = false;
      flux.getTracks().forEach((t) => t.stop());
      audio.close().catch(() => {});
      return;
    }
    try {
      flux.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (session.current?.flux !== flux) return;
        arreter();
        toast.error("Micro déconnecté : la dictée est arrêtée.");
      });
      const analyseur = audio.createAnalyser();
      analyseur.fftSize = 1024;
      audio.createMediaStreamSource(flux).connect(analyseur);
      const maintenant = performance.now();
      const s: Session = {
        flux,
        audio,
        analyseur,
        echantillons: new Float32Array(analyseur.fftSize),
        minuterie: setInterval(tic, PAS_MS),
        debut: maintenant,
        segment: null,
        debutSegment: maintenant,
        voixMs: 0,
        derniereVoix: 0,
        derniereVoixSession: maintenant,
      };
      session.current = s;
      setDuree(0);
      // « Parlez » seulement quand l'enregistreur tourne : avant, les premiers mots seraient perdus.
      nouveauSegment(s, () => {
        if (session.current !== s) return;
        bip(audio);
        setEtat("enregistrement");
        rappels.current.onEnregistrement?.(true);
      });
    } catch {
      // Navigateur qui refuse l'enregistrement : rien ne doit rester ouvert ni bloqué.
      if (session.current) {
        arreter();
      } else {
        dicteeEnCours = false;
        flux.getTracks().forEach((t) => t.stop());
        audio.close().catch(() => {});
        setEtat("repos");
      }
      toast.error("L'enregistrement n'a pas pu démarrer sur ce navigateur.");
    }
  };

  // Échap arrête, où que soit le curseur.
  useEffect(() => {
    if (etat !== "enregistrement") return;
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing && !e.defaultPrevented)
        arreter();
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
    // `arreter` ne lit que des refs et des setters stables : la version capturée reste juste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat]);

  // Fermer ou recharger l'onglet perdrait des phrases déjà facturées : le navigateur demande confirmation.
  const aProteger = etat === "enregistrement" || enAttente > 0;
  useEffect(() => {
    if (!aProteger) return;
    const avantDepart = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avantDepart);
    return () => window.removeEventListener("beforeunload", avantDepart);
  }, [aProteger]);

  // Quitter la page en pleine dictée coupe le micro sans rien envoyer.
  useEffect(() => {
    monte.current = true;
    const ouvertes = notifications.current;
    return () => {
      monte.current = false;
      // « Renvoyer la phrase » n'a plus d'éditeur où écrire une fois la page quittée.
      ouvertes.forEach((id) => toast.dismiss(id));
      const s = session.current;
      if (!s) return;
      session.current = null;
      dicteeEnCours = false;
      if (s.segment) {
        const r = s.segment.enregistreur;
        r.onstop = null;
        if (r.state !== "inactive") r.stop();
      }
      liberer(s);
    };
  }, []);

  const enregistre = etat === "enregistrement";
  const occupe = etat === "preparation" || (etat === "repos" && enAttente > 0);

  if (enregistre) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed
          aria-label={`Arrêter la dictée (Échap), ${chrono(duree)}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={arreter}
          className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700"
        >
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-white" />
          <span className="tabular-nums">{chrono(duree)}</span>
          <span aria-hidden className="flex h-4 items-end gap-0.5">
            {[1, 2, 3, 4].map((barre) => (
              <span
                key={barre}
                className={`w-1 rounded-sm ${niveau >= barre ? "bg-white" : "bg-red-300"}`}
                style={{ height: `${barre * 25}%` }}
              />
            ))}
          </span>
          Arrêter
          <span className="rounded-[var(--radius-control)] bg-white/20 px-1.5 py-0.5 text-[11px]">
            Échap
          </span>
        </button>
        <span aria-live="polite" className="text-sm font-medium text-red-700">
          Micro ouvert — parlez
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={occupe}
      // onMouseDown + preventDefault : le curseur reste dans le texte, là où la phrase sera insérée.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void demarrer()}
      className={`flex h-9 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition-colors ${
        occupe
          ? "cursor-wait bg-gray-200 text-gray-700"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {occupe ? (
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
      ) : (
        <Mic aria-hidden className="h-4 w-4" />
      )}
      {etat === "preparation"
        ? "Préparation…"
        : occupe
          ? "Insertion…"
          : "Dicter"}
    </button>
  );
}
