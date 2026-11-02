/**
 * Lecture d'un flux `text/event-stream` reçu par `fetch`.
 *
 * <p>`EventSource` ne sait faire que des GET sans en-tête : l'assistant poste le
 * message et doit poser `X-Branch-Id`. On lit donc le corps à la main. Un
 * événement peut être coupé entre deux paquets réseau : on garde le reste du
 * tampon jusqu'à la ligne vide qui le termine.</p>
 */
export interface EvenementSse {
  event: string;
  data: unknown;
}

/** Découpe ce qui est complet dans `tampon` ; renvoie les événements et le reste. */
export function decouperSse(tampon: string): { evenements: EvenementSse[]; reste: string } {
  const blocs = tampon.replace(/\r\n/g, "\n").split("\n\n");
  const reste = blocs.pop() ?? "";
  const evenements: EvenementSse[] = [];
  for (const bloc of blocs) {
    let event = "message";
    const data: string[] = [];
    for (const ligne of bloc.split("\n")) {
      if (ligne.startsWith(":")) continue; // commentaire (ping)
      if (ligne.startsWith("event:")) event = ligne.slice(6).trim();
      else if (ligne.startsWith("data:")) data.push(ligne.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0) continue;
    const brut = data.join("\n");
    let valeur: unknown = brut;
    try {
      valeur = JSON.parse(brut);
    } catch {
      // donnée non JSON : on la rend telle quelle
    }
    evenements.push({ event, data: valeur });
  }
  return { evenements, reste };
}

/** Lit tout le flux et appelle `surEvenement` pour chaque événement complet. */
export async function lireSse(
  corps: ReadableStream<Uint8Array>,
  surEvenement: (e: EvenementSse) => void,
): Promise<void> {
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";
  for (;;) {
    const { done, value } = await lecteur.read();
    tampon += done ? decodeur.decode() + "\n\n" : decodeur.decode(value, { stream: true });
    const { evenements, reste } = decouperSse(tampon);
    tampon = reste;
    evenements.forEach(surEvenement);
    if (done) return;
  }
}
