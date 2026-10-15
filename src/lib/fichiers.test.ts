import { describe, expect, it } from "vitest";
import { urlFichier } from "./fichiers";

describe("urlFichier", () => {
  it("préfère l'identifiant quand il est présent", () => {
    expect(urlFichier({ fileId: "abc-123", path: "documents/x.pdf" })).toBe(
      "http://localhost:8080/api/v1/files/abc-123",
    );
  });

  it("retombe sur le chemin sans identifiant", () => {
    expect(urlFichier({ path: "/documents/x.pdf" })).toBe(
      "http://localhost:8080/api/v1/files/documents/x.pdf",
    );
    expect(urlFichier({ fileId: null, path: "images/a.jpg" })).toBe(
      "http://localhost:8080/api/v1/files/images/a.jpg",
    );
  });

  it("laisse un chemin déjà absolu inchangé", () => {
    expect(urlFichier({ path: "https://cdn.example.com/a.png" })).toBe(
      "https://cdn.example.com/a.png",
    );
  });
});
