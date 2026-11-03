import { describe, expect, it } from "vitest";
import { decouperSse, lireSse, type EvenementSse } from "./assistant-sse";

describe("decouperSse", () => {
  it("rend les événements complets et garde le morceau inachevé", () => {
    const { evenements, reste } = decouperSse(
      'event: token\ndata: {"texte":"Bon"}\n\n: ping\n\nevent: done\ndata: {}\n\nevent: tok',
    );
    expect(evenements).toEqual([
      { event: "token", data: { texte: "Bon" } },
      { event: "done", data: {} },
    ]);
    expect(reste).toBe("event: tok");
  });

  it("accepte les fins de ligne CRLF et les données sur plusieurs lignes", () => {
    const { evenements } = decouperSse("event: x\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(evenements).toEqual([{ event: "x", data: "a\nb" }]);
  });
});

describe("lireSse", () => {
  it("recolle un événement coupé entre deux paquets", async () => {
    const enc = new TextEncoder();
    const morceaux = ['event: token\ndata: {"tex', 'te":"jour"}\n\nevent: done\ndata: {}'];
    const corps = new ReadableStream<Uint8Array>({
      start(c) {
        morceaux.forEach((m) => c.enqueue(enc.encode(m)));
        c.close();
      },
    });
    const recus: EvenementSse[] = [];
    await lireSse(corps, (e) => recus.push(e));
    expect(recus).toEqual([
      { event: "token", data: { texte: "jour" } },
      { event: "done", data: {} },
    ]);
  });
});
