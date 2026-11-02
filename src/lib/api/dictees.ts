import apiClient from "./client";

/** Dictée vocale : un segment audio enregistré → le texte à insérer dans le compte rendu. */
export const dicteesApi = {
  transcrire: (audio: Blob) => {
    const form = new FormData();
    form.append("audio", audio, "segment");
    return apiClient.post<{ texte: string }>("/dictees", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
