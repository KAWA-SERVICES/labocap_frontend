import { beforeEach, describe, expect, it } from "vitest";
import {
  beginPending2fa,
  clearPending2fa,
  getPending2faEmail,
  getPending2faEmailPourRenvoi,
  masquerEmail,
} from "./auth-2fa";

describe("masquerEmail", () => {
  it("garde le premier et le dernier caractère de la partie locale, et le domaine", () => {
    expect(masquerEmail("vincente@caap.bj")).toBe("v…e@caap.bj");
    expect(masquerEmail("ab@caap.bj")).toBe("a…@caap.bj");
    expect(masquerEmail("a@caap.bj")).toBe("a…@caap.bj");
  });

  it("masque aussi une valeur sans arobase", () => {
    expect(masquerEmail("vincent")).toBe("v…t");
  });
});

describe("cookie pending_2fa_email", () => {
  beforeEach(() => clearPending2fa());

  it("ne contient que l'adresse masquée ; l'adresse en clair reste en mémoire", () => {
    beginPending2fa("vincente@caap.bj", 300, "EMAIL");
    expect(document.cookie).toContain("pending_2fa_email=" + encodeURIComponent("v…e@caap.bj"));
    expect(document.cookie).not.toContain("vincente");
    expect(getPending2faEmail()).toBe("v…e@caap.bj");
    expect(getPending2faEmailPourRenvoi()).toBe("vincente@caap.bj");
    clearPending2fa();
    expect(getPending2faEmail()).toBeNull();
    expect(getPending2faEmailPourRenvoi()).toBeNull();
  });
});
