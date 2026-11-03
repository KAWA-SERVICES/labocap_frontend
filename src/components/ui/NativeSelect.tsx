"use client";

import {
  Children,
  isValidElement,
  useMemo,
  type ChangeEvent,
  type ChangeEventHandler,
  type ReactNode,
  type SelectHTMLAttributes,
  type Ref,
} from "react";
import type { ClassNamesConfig, GroupBase, StylesConfig } from "react-select";
import { LimitedSelect as ReactSelect } from "@/components/ui/LimitedSelect";
import { LimitedCreatableSelect as CreatableSelect } from "./LimitedSelect";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSelectStyles, SELECT_MENU_CLASSNAMES } from "./selectStyles";

interface NativeSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  /** Applique le style d'erreur (bordure rouge). */
  error?: boolean;
  ref?: Ref<HTMLSelectElement>;
  /** Classe appliquée au conteneur (largeur, marges…). */
  className?: string;
  /** Classe appliquée au `<select>` natif lui-même (variante non enrichie). */
  selectClassName?: string;
  /** Placeholder (utilisé en mode enrichi react-select). */
  placeholder?: string;
  /**
   * onChange compatible `<select>` natif : reçoit un événement dont
   * `target.value` porte la valeur choisie (en mode enrichi react-select,
   * un événement synthétique de même forme est fourni).
   */
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  /**
   * Autorise la saisie d'une nouvelle valeur absente de la liste.
   * `onCreateOption` est appelé avec le texte saisi (à charger de créer
   * l'entité côté backend puis de la sélectionner).
   */
  creatable?: boolean;
  onCreateOption?: (input: string) => void;
}

type Opt = { value: string; label: string; isDisabled?: boolean };

/**
 * Extrait récursivement les `<option>` (y compris ceux issus de `.map()` ou
 * de fragments) en une liste d'options react-select.
 */
function extractOptions(children: ReactNode, acc: Opt[]): void {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as {
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      };
      const value = String(props.value ?? "");
      const label =
        typeof props.children === "string"
          ? props.children
          : Array.isArray(props.children)
            ? props.children.filter((c) => typeof c === "string").join("")
            : String(props.children ?? value);
      acc.push({ value, label, isDisabled: props.disabled });
    } else {
      // Fragment ou wrapper : on descend dans ses enfants.
      const props = child.props as { children?: ReactNode };
      if (props?.children) extractOptions(props.children, acc);
    }
  });
}

/**
 * Nombre de données réelles (hors option « vide/Tous ») à partir duquel la
 * liste bascule en react-select.
 *
 * Fixé à 0 : **tous** les selects de l'application ont désormais la même
 * apparence et le même comportement. Auparavant le seuil était à 5, si bien
 * qu'une même page mélangeait un `<select>` natif (statuts, 3 options) et un
 * react-select (catégories, 20 options) — l'écart signalé sur `/expenses`.
 * Un select réduit à son seul placeholder reste natif : rien à chercher.
 */
const ENHANCE_THRESHOLD = 0;

/**
 * `<select>` de l'application : react-select **cherchable**, borné à 6 options
 * affichées (la recherche porte sur toute la liste), et optionnellement
 * **créable** (`creatable` + `onCreateOption`). L'API (`value` + `onChange`
 * façon événement natif) reste celle d'un `<select>` natif, auquel on retombe
 * quand il n'y a aucune donnée à proposer.
 */
export function NativeSelect({
  className,
  selectClassName,
  error,
  ref,
  children,
  value,
  onChange,
  disabled,
  placeholder,
  name,
  id,
  creatable,
  onCreateOption,
  ...props
}: NativeSelectProps) {
  const options = useMemo(() => {
    const acc: Opt[] = [];
    extractOptions(children, acc);
    return acc;
  }, [children]);

  const dataCount = options.filter((o) => o.value !== "").length;
  const enhance = dataCount > ENHANCE_THRESHOLD;

  if (enhance) {
    const current = String(value ?? "");
    const selected = options.find((o) => o.value === current) ?? null;
    const portalTarget =
      typeof document !== "undefined" ? document.body : undefined;

    const commonProps = {
      inputId: id,
      // Sans lui, le libellé donné au select natif se perdait en mode enrichi :
      // le champ de recherche n'avait plus de nom accessible.
      "aria-label": props["aria-label"],
      name,
      options,
      value: selected,
      isDisabled: disabled,
      isSearchable: true,
      placeholder: placeholder ?? "Sélectionner...",
      classNamePrefix: "react-select",
      menuPortalTarget: portalTarget,
      // Styles partagés (mêmes que `FormSelect` et `RemoteSelectField`) : sans
      // eux ce select retombait sur l'apparence par défaut de react-select et
      // détonnait à côté des autres champs de sélection. Ils sont écrits pour
      // `SelectOption` ; `Opt` en est une extension (`isDisabled` en plus), et
      // les styles ne touchent pas aux données de l'option.
      styles: buildSelectStyles(!!error) as unknown as StylesConfig<
        Opt,
        false,
        GroupBase<Opt>
      >,
      classNames: SELECT_MENU_CLASSNAMES as unknown as ClassNamesConfig<
        Opt,
        false,
        GroupBase<Opt>
      >,
      onChange: (opt: Opt | null) =>
        onChange?.({
          target: { value: opt?.value ?? "", name },
        } as unknown as ChangeEvent<HTMLSelectElement>),
      noOptionsMessage: () => "Aucun résultat",
    };

    return (
      <div className={cn("group relative", className)}>
        {creatable ? (
          <CreatableSelect<Opt, false>
            {...commonProps}
            onCreateOption={onCreateOption}
            formatCreateLabel={(input: string) => `Ajouter « ${input} »`}
          />
        ) : (
          <ReactSelect<Opt, false> {...commonProps} />
        )}
      </div>
    );
  }

  // Liste courte : `<select>` natif inchangé.
  return (
    <div className={cn("group relative", className)}>
      <select
        ref={ref}
        value={value}
        disabled={disabled}
        name={name}
        id={id}
        onChange={onChange as SelectHTMLAttributes<HTMLSelectElement>["onChange"]}
        className={cn(
          "native-select w-full cursor-pointer rounded-[var(--radius-control)] border bg-white px-3 py-2 min-h-[40px] pr-10 text-sm text-gray-700 shadow-sm outline-none transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-emphasized disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          error
            ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
            : "border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10",
          selectClassName
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors",
          !error && "group-focus-within:text-blue-500"
        )}
      />
    </div>
  );
}
