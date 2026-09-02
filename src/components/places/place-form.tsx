"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { EMPTY_FORM_STATE, type FormState } from "@/actions/form-state";
import { LocationPickerLazy } from "@/components/map/location-picker-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAP_CENTER } from "@/lib/config";
import type { Category } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface PlaceFormValues {
  name: string;
  categoryId: string;
  lat: string;
  lng: string;
  address: string;
  description: string;
  tips: string;
  instagram: string;
  website: string;
  /** "" | "1".."4" */
  priceLevel: string;
  hasNarga: "yes" | "no" | "unknown";
  googleMapsUrl: string;
  googlePlaceId: string;
}

export type PlaceFormInitial = Partial<PlaceFormValues> & { id?: string };

export interface PlaceFormProps {
  categories: Category[];
  initial?: PlaceFormInitial;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Nome, categoria e posição só pra quem criou o lugar (ou admin) — ver docs/05. */
  canEditCore: boolean;
  submitLabel?: string;
  /** Mapa pra ajustar o pino. O wizard já resolveu a posição no passo 1. */
  showPositionPicker?: boolean;
  center?: [number, number];
  /** Chamado a cada mudança — o wizard usa pra guardar rascunho. */
  onValuesChange?: (values: PlaceFormValues) => void;
  onSubmitStart?: () => void;
  className?: string;
}

const HAS_NARGA_OPTIONS = [
  { value: "yes", label: "Tem 💨" },
  { value: "no", label: "Não tem" },
  { value: "unknown", label: "Não sei" },
] as const;

const DESCRIPTION_MAX = 280;

function readValues(form: HTMLFormElement): PlaceFormValues {
  const data = new FormData(form);
  const get = (key: string) => {
    const value = data.get(key);
    return typeof value === "string" ? value : "";
  };
  const hasNarga = get("hasNarga");
  return {
    name: get("name"),
    categoryId: get("categoryId"),
    lat: get("lat"),
    lng: get("lng"),
    address: get("address"),
    description: get("description"),
    tips: get("tips"),
    instagram: get("instagram"),
    website: get("website"),
    priceLevel: get("priceLevel"),
    hasNarga: hasNarga === "yes" || hasNarga === "no" ? hasNarga : "unknown",
    googleMapsUrl: get("googleMapsUrl"),
    googlePlaceId: get("googlePlaceId"),
  };
}

export function PlaceForm({
  categories,
  initial,
  action,
  canEditCore,
  submitLabel = "Salvar",
  showPositionPicker = false,
  center = MAP_CENTER,
  onValuesChange,
  onSubmitStart,
  className,
}: PlaceFormProps) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [hasNarga, setHasNarga] = useState<"yes" | "no" | "unknown">(
    initial?.hasNarga ?? "unknown",
  );
  const [priceLevel, setPriceLevel] = useState(initial?.priceLevel ?? "");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = Number(initial?.lat);
    const lng = Number(initial?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && initial?.lat ? { lat, lng } : null;
  });
  const [descriptionLength, setDescriptionLength] = useState(initial?.description?.length ?? 0);

  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);

  const notify = useCallback(() => {
    const form = formRef.current;
    if (!form || !onValuesChangeRef.current) return;
    onValuesChangeRef.current(readValues(form));
  }, []);

  // Os campos controlados só chegam ao DOM depois do commit; por isso o notify vem daqui.
  useEffect(() => {
    notify();
  }, [categoryId, hasNarga, priceLevel, position, notify]);

  const selected = categories.find((c) => c.id === categoryId);
  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={notify}
      onSubmit={() => onSubmitStart?.()}
      className={cn("flex flex-col gap-5", className)}
      noValidate
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="lat" value={position ? String(position.lat) : ""} />
      <input type="hidden" name="lng" value={position ? String(position.lng) : ""} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="hasNarga" value={hasNarga} />
      <input type="hidden" name="priceLevel" value={priceLevel} />
      <input type="hidden" name="googleMapsUrl" defaultValue={initial?.googleMapsUrl ?? ""} />
      <input type="hidden" name="googlePlaceId" defaultValue={initial?.googlePlaceId ?? ""} />

      <Field label="Nome" htmlFor="place-name" error={fieldError("name")}>
        <Input
          id="place-name"
          name="name"
          defaultValue={initial?.name ?? ""}
          maxLength={120}
          required
          readOnly={!canEditCore}
          aria-invalid={fieldError("name") ? true : undefined}
          className={cn("h-11", !canEditCore && "opacity-70")}
        />
        {!canEditCore ? (
          <p className="text-muted-foreground text-xs">
            Só quem criou (ou um admin) muda nome, categoria e posição.
          </p>
        ) : null}
      </Field>

      <div className="flex flex-col gap-1.5">
        <Label>Categoria</Label>
        {canEditCore ? (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Categoria">
            {categories.map((category) => {
              const active = category.id === categoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategoryId(category.id)}
                  style={{ borderColor: active ? category.color : undefined }}
                  className={cn(
                    "focus-visible:ring-ring/50 flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-3",
                    active
                      ? "bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span aria-hidden className="text-lg leading-5">
                    {category.emoji}
                  </span>
                  {category.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="border-border text-muted-foreground flex h-11 items-center rounded-lg border px-3 text-sm">
            {selected ? `${selected.emoji} ${selected.name}` : "—"}
          </p>
        )}
        {fieldError("categoryId") ? (
          <p className="text-destructive text-xs">{fieldError("categoryId")}</p>
        ) : null}
      </div>

      {canEditCore && showPositionPicker ? (
        <div className="flex flex-col gap-1.5">
          <Label>Posição</Label>
          <LocationPickerLazy
            value={position}
            onChange={setPosition}
            center={center}
            emoji={selected?.emoji ?? "📍"}
            color={selected?.color ?? "#f4b942"}
            className="border-border h-56 overflow-hidden rounded-lg border"
          />
          <p className="text-muted-foreground text-xs">
            Arraste o pino ou toque no mapa pra ajustar.
          </p>
          {fieldError("lat") || fieldError("lng") ? (
            <p className="text-destructive text-xs">{fieldError("lat") ?? fieldError("lng")}</p>
          ) : null}
        </div>
      ) : null}

      <Field label="Endereço" htmlFor="place-address" error={fieldError("address")}>
        <Input
          id="place-address"
          name="address"
          defaultValue={initial?.address ?? ""}
          maxLength={240}
          className="h-11"
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Label>Tem narga?</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Tem narga?">
          {HAS_NARGA_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              active={hasNarga === option.value}
              onClick={() => setHasNarga(option.value)}
              label={option.label}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Preço</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Faixa de preço">
          {["1", "2", "3", "4"].map((level) => (
            <ChoiceButton
              key={level}
              active={priceLevel === level}
              onClick={() => setPriceLevel(priceLevel === level ? "" : level)}
              label={"$".repeat(Number(level))}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-xs">Toque de novo pra desmarcar.</p>
      </div>

      <Field label="Descrição" htmlFor="place-description" error={fieldError("description")}>
        <Textarea
          id="place-description"
          name="description"
          defaultValue={initial?.description ?? ""}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          onChange={(event) => setDescriptionLength(event.currentTarget.value.length)}
          placeholder="Em uma linha: o que é esse lugar?"
        />
        <p className="text-muted-foreground text-right text-xs tabular-nums">
          {descriptionLength}/{DESCRIPTION_MAX}
        </p>
      </Field>

      <Field label="Dicas" htmlFor="place-tips" error={fieldError("tips")}>
        <Textarea
          id="place-tips"
          name="tips"
          defaultValue={initial?.tips ?? ""}
          maxLength={1000}
          rows={3}
          placeholder="O que pedir, quando ir, o que evitar."
        />
      </Field>

      <Field label="Instagram" htmlFor="place-instagram" error={fieldError("instagram")}>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">@</span>
          <Input
            id="place-instagram"
            name="instagram"
            defaultValue={initial?.instagram ?? ""}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="sebodojoao"
            className="h-11"
          />
        </div>
      </Field>

      <Field label="Site" htmlFor="place-website" error={fieldError("website")}>
        <Input
          id="place-website"
          name="website"
          type="url"
          inputMode="url"
          defaultValue={initial?.website ?? ""}
          maxLength={240}
          placeholder="https://"
          className="h-11"
        />
      </Field>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 flex h-11 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3",
        active
          ? "border-narga bg-narga/15 text-narga"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
