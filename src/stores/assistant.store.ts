import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AssistantStore {
  ouvert: boolean;
  conversationId: string | null;
  basculer: () => void;
  fermer: () => void;
  setConversationId: (id: string | null) => void;
}

/**
 * État du panneau de l'assistant. La conversation en cours est persistée pour
 * qu'un rechargement de page la retrouve ; l'ouverture ne l'est pas — un
 * panneau qui se rouvre seul au chargement surprend.
 */
export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      ouvert: false,
      conversationId: null,
      basculer: () => set((s) => ({ ouvert: !s.ouvert })),
      fermer: () => set({ ouvert: false }),
      setConversationId: (id) => set({ conversationId: id }),
    }),
    {
      name: "assistant-storage",
      partialize: (s) => ({ conversationId: s.conversationId }),
    },
  ),
);
