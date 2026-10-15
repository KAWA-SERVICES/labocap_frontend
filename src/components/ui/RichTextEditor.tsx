"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitize } from "@/lib/sanitize";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  List,
  ListOrdered,
  Indent,
  Outdent,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Code,
  Link as LinkIcon,
  Unlink,
  Minus,
  Baseline,
  Highlighter,
  Undo2,
  Redo2,
  RemoveFormatting,
  Eraser,
} from "lucide-react";

/**
 * Éditeur de texte enrichi (type « Word » / CKEditor) basé sur contentEditable.
 *
 * Produit du HTML — cohérent avec le pipeline d'impression du compte rendu
 * (le PDF rend le contenu en HTML brut, comme la vue Laravel qui utilise CKEditor 5).
 * Aucune dépendance externe : la barre d'outils s'appuie sur document.execCommand,
 * universellement supporté pour ce type d'édition.
 *
 * Les boutons/sélecteurs reflètent l'état de la sélection courante (actif =
 * surligné, comme dans Word) grâce à queryCommandState / queryCommandValue.
 */
export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hauteur minimale de la zone d'édition (classe Tailwind). Défaut min-h-[200px]. */
  minHeightClass?: string;
}

const HEADING_OPTIONS = [
  { label: "Paragraphe", value: "P" },
  { label: "Titre 1", value: "H1" },
  { label: "Titre 2", value: "H2" },
  { label: "Titre 3", value: "H3" },
  { label: "Titre 4", value: "H4" },
  { label: "Titre 5", value: "H5" },
  { label: "Titre 6", value: "H6" },
  { label: "Préformaté", value: "PRE" },
  { label: "Citation", value: "BLOCKQUOTE" },
];

/**
 * Polices proposées — toutes se matérialisent dans le PDF.
 *
 * Le format PDF ne garantit que quatorze polices de base. Arial, Times New
 * Roman et Courier New y correspondent exactement (Helvetica, Times, Courier,
 * mêmes métriques). Les cinq autres n'ont aucun équivalent : le backend
 * embarque pour elles des substituts libres — Gelasio pour Georgia, DejaVu
 * Sans pour Verdana, Tahoma et Trebuchet MS, Comic Neue pour Comic Sans MS
 * (cf. PdfFonts côté serveur).
 *
 * Ces substituts ressemblent aux originales sans les égaler : les polices de
 * Microsoft ne sont pas redistribuables. Le dessin diffère légèrement, le
 * genre et l'intention sont respectés.
 */
const FONT_OPTIONS = [
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Comic Sans MS",
];

// Tailles execCommand fontSize (1..7) mappées vers un libellé lisible en px.
const SIZE_OPTIONS = [
  { label: "8", value: "1" },
  { label: "10", value: "2" },
  { label: "12", value: "3" },
  { label: "14", value: "4" },
  { label: "18", value: "5" },
  { label: "24", value: "6" },
  { label: "36", value: "7" },
];

// Commandes à bascule dont on reflète l'état actif.
const STATE_COMMANDS = [
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "subscript",
  "superscript",
  "insertUnorderedList",
  "insertOrderedList",
  "justifyLeft",
  "justifyCenter",
  "justifyRight",
  "justifyFull",
] as const;

type ActiveState = Record<string, boolean>;

const SELECT_CLASS =
  "mr-1 rounded-[var(--radius-control)] border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500";

// Séparateur vertical de la barre d'outils.
function Sep() {
  return <span className="mx-1 h-5 w-px bg-gray-200" />;
}

// Bouton icône de la barre d'outils — surligné quand la commande est active.
function ToolBtn({
  title,
  onRun,
  isActive = false,
  children,
}: {
  title: string;
  onRun: () => void;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={isActive}
      onMouseDown={(e) => {
        // onMouseDown pour préserver la sélection avant l'exécution
        e.preventDefault();
        onRun();
      }}
      className={`rounded-[var(--radius-control)] p-1.5 transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-300"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  minHeightClass = "min-h-[200px]",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Recalcule `isEmpty` quand la valeur externe change, pendant le rendu plutôt
  // que dans un effet (évite un rendu en cascade). Pattern React « ajuster l'état
  // lorsqu'une prop change » : https://react.dev/learn/you-might-not-need-an-effect
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setIsEmpty(!value || value === "<br>" || value.trim() === "");
  }

  // État de la sélection courante (pour surligner les options actives).
  const [active, setActive] = useState<ActiveState>({});
  const [blockFormat, setBlockFormat] = useState<string>("P");
  const [fontName, setFontNameState] = useState<string>("");
  const [fontSize, setFontSizeState] = useState<string>("");

  // Synchronise le DOM avec `value` uniquement quand le contenu externe diffère
  // (évite les sauts de curseur pendant la frappe). `value` vient de l'API :
  // nettoyé avant injection.
  useEffect(() => {
    const el = editorRef.current;
    const propre = sanitize(value ?? "");
    if (el && el.innerHTML !== propre) {
      el.innerHTML = propre;
    }
  }, [value]);

  // Recalcule l'état actif des commandes selon la sélection.
  const refreshState = useCallback(() => {
    if (disabled) return;
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;

    const next: ActiveState = {};
    for (const cmd of STATE_COMMANDS) {
      try {
        next[cmd] = document.queryCommandState(cmd);
      } catch {
        next[cmd] = false;
      }
    }
    setActive(next);

    try {
      const block = (document.queryCommandValue("formatBlock") || "").toUpperCase();
      setBlockFormat(HEADING_OPTIONS.some((h) => h.value === block) ? block : "P");
    } catch {
      setBlockFormat("P");
    }
    try {
      setFontNameState((document.queryCommandValue("fontName") || "").replace(/["']/g, ""));
    } catch {
      setFontNameState("");
    }
    try {
      setFontSizeState(document.queryCommandValue("fontSize") || "");
    } catch {
      setFontSizeState("");
    }
  }, [disabled]);

  // Écoute les changements de sélection (uniquement quand elle est dans l'éditeur).
  useEffect(() => {
    if (disabled) return;
    const handler = () => refreshState();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [disabled, refreshState]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    setIsEmpty(el.textContent?.trim() === "" && !html.includes("<img"));
    onChange(html === "<br>" ? "" : html);
    refreshState();
  };

  const exec = (command: string, val?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    handleInput();
  };

  const applyFontSize = (val: string) => {
    if (disabled || !val) return;
    editorRef.current?.focus();
    document.execCommand("fontSize", false, val);
    handleInput();
  };

  const applyHeading = (val: string) => {
    if (disabled || !val) return;
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, val);
    handleInput();
  };

  const applyFont = (val: string) => {
    if (disabled || !val) return;
    editorRef.current?.focus();
    document.execCommand("fontName", false, val);
    handleInput();
  };

  const insertLink = () => {
    if (disabled) return;
    const url = window.prompt("Adresse du lien (URL) :", "https://");
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    handleInput();
  };

  // Valeur affichée dans le select police (vide si la police courante n'est pas listée).
  const fontSelectValue = FONT_OPTIONS.find(
    (f) => f.toLowerCase() === fontName.toLowerCase()
  ) ?? "";

  return (
    <div
      className={`rounded-[var(--radius-surface)] border shadow-[var(--elevation-flat)] ${
        disabled
          ? "border-gray-200 bg-gray-50"
          : "border-gray-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
      }`}
    >
      {/* Barre d'outils */}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5">
          {/* Style de paragraphe (synchronisé) */}
          <select
            title="Style de paragraphe"
            value={blockFormat}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => applyHeading(e.target.value)}
            className={SELECT_CLASS}
          >
            {HEADING_OPTIONS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>

          {/* Police (synchronisée) */}
          <select
            title="Police"
            value={fontSelectValue}
            onChange={(e) => applyFont(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Police</option>
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>

          {/* Taille (synchronisée) */}
          <select
            title="Taille du texte"
            value={SIZE_OPTIONS.some((s) => s.value === fontSize) ? fontSize : ""}
            onChange={(e) => applyFontSize(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Taille</option>
            {SIZE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <Sep />

          {/* Mise en forme du caractère */}
          <ToolBtn title="Gras (Ctrl+B)" isActive={active.bold} onRun={() => exec("bold")}>
            <Bold className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Italique (Ctrl+I)" isActive={active.italic} onRun={() => exec("italic")}>
            <Italic className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Souligné (Ctrl+U)" isActive={active.underline} onRun={() => exec("underline")}>
            <Underline className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Barré" isActive={active.strikeThrough} onRun={() => exec("strikeThrough")}>
            <Strikethrough className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Indice" isActive={active.subscript} onRun={() => exec("subscript")}>
            <Subscript className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Exposant" isActive={active.superscript} onRun={() => exec("superscript")}>
            <Superscript className="h-4 w-4" />
          </ToolBtn>

          <Sep />

          {/* Couleurs */}
          <label
            title="Couleur du texte"
            className="relative flex cursor-pointer items-center rounded-[var(--radius-control)] p-1.5 text-gray-600 hover:bg-gray-100"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Baseline className="h-4 w-4" />
            <input
              type="color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => exec("foreColor", e.target.value)}
            />
          </label>
          <label
            title="Couleur de surlignage"
            className="relative flex cursor-pointer items-center rounded-[var(--radius-control)] p-1.5 text-gray-600 hover:bg-gray-100"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Highlighter className="h-4 w-4" />
            <input
              type="color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                // hiliteColor pour la plupart des navigateurs, repli sur backColor
                if (!document.execCommand("hiliteColor", false, e.target.value)) {
                  exec("backColor", e.target.value);
                } else {
                  handleInput();
                }
              }}
            />
          </label>

          <Sep />

          {/* Listes & retraits */}
          <ToolBtn title="Liste à puces" isActive={active.insertUnorderedList} onRun={() => exec("insertUnorderedList")}>
            <List className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Liste numérotée" isActive={active.insertOrderedList} onRun={() => exec("insertOrderedList")}>
            <ListOrdered className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Diminuer le retrait" onRun={() => exec("outdent")}>
            <Outdent className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Augmenter le retrait" onRun={() => exec("indent")}>
            <Indent className="h-4 w-4" />
          </ToolBtn>

          <Sep />

          {/* Alignement */}
          <ToolBtn title="Aligner à gauche" isActive={active.justifyLeft} onRun={() => exec("justifyLeft")}>
            <AlignLeft className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Centrer" isActive={active.justifyCenter} onRun={() => exec("justifyCenter")}>
            <AlignCenter className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Aligner à droite" isActive={active.justifyRight} onRun={() => exec("justifyRight")}>
            <AlignRight className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Justifier" isActive={active.justifyFull} onRun={() => exec("justifyFull")}>
            <AlignJustify className="h-4 w-4" />
          </ToolBtn>

          <Sep />

          {/* Blocs & insertions */}
          <ToolBtn
            title="Citation"
            isActive={blockFormat === "BLOCKQUOTE"}
            onRun={() => applyHeading("BLOCKQUOTE")}
          >
            <Quote className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Bloc de code" isActive={blockFormat === "PRE"} onRun={() => applyHeading("PRE")}>
            <Code className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Insérer un lien" onRun={insertLink}>
            <LinkIcon className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Supprimer le lien" onRun={() => exec("unlink")}>
            <Unlink className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Ligne horizontale" onRun={() => exec("insertHorizontalRule")}>
            <Minus className="h-4 w-4" />
          </ToolBtn>

          <Sep />

          {/* Historique & nettoyage */}
          <ToolBtn title="Annuler (Ctrl+Z)" onRun={() => exec("undo")}>
            <Undo2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Rétablir (Ctrl+Y)" onRun={() => exec("redo")}>
            <Redo2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Effacer la mise en forme" onRun={() => exec("removeFormat")}>
            <RemoveFormatting className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn
            title="Tout effacer"
            onRun={() => {
              if (editorRef.current) {
                editorRef.current.innerHTML = "";
                handleInput();
              }
            }}
          >
            <Eraser className="h-4 w-4" />
          </ToolBtn>
        </div>
      )}

      {/* Zone d'édition */}
      <div className="relative">
        {isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3 top-3 text-sm text-gray-400">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          onFocus={refreshState}
          suppressContentEditableWarning
          className={`rte-content ${minHeightClass} w-full overflow-auto px-3 py-3 text-sm text-gray-800 focus:outline-none ${
            disabled ? "cursor-not-allowed text-gray-500" : ""
          }`}
        />
      </div>
    </div>
  );
}
