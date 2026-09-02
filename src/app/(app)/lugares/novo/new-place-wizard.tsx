"use client";

import { ArrowLeft, ClipboardPaste, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { createPlace } from "@/actions/places";
import { LocationPickerLazy } from "@/components/map/location-picker-lazy";
import { PlaceForm, type PlaceFormValues } from "@/components/places/place-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/db/schema";
import type { GeocodeResult } from "@/lib/geocode";
import type { ParsedMapsLink } from "@/lib/maps-link";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "eonarga:novo-lugar";
// TODO(fase3): vira "1 de 3" quando a tela de avaliar existir (o passo 3 é "sua nota").
const TOTAL_STEPS = 2;

interface LatLng {
  lat: number;
  lng: number;
}

/**
 * O rascunho é lido uma vez por sessão de aba e memoizado: `useSyncExternalStore` exige
 * um snapshot estável, e é ele que evita o descompasso entre HTML do servidor e cliente
 * (o servidor sempre vê `null`).
 */
let cachedDraft: Partial<PlaceFormValues> | null = null;
let cacheFilled = false;

function getDraftSnapshot(): Partial<PlaceFormValues> | null {
  if (cacheFilled) return cachedDraft;
  cacheFilled = true;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedDraft =
      parsed && typeof parsed === "object" ? (parsed as Partial<PlaceFormValues>) : null;
  } catch {
    cachedDraft = null;
  }
  return cachedDraft;
}

function getServerDraftSnapshot(): Partial<PlaceFormValues> | null {
  return null;
}

/** Ninguém mexe no rascunho por fora; a assinatura existe só pra satisfazer a API. */
function subscribeDraft() {
  return () => {};
}

function saveDraft(values: PlaceFormValues) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
  } catch {
    // Aba anônima com storage bloqueado: sem rascunho, mas o formulário funciona.
  }
}

function clearDraft() {
  cachedDraft = null;
  cacheFilled = true;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // idem
  }
}

interface Where {
  position: LatLng | null;
  name: string;
  address: string;
  googleMapsUrl: string;
  googlePlaceId: string;
}

const EMPTY_WHERE: Where = {
  position: null,
  name: "",
  address: "",
  googleMapsUrl: "",
  googlePlaceId: "",
};

function whereFromDraft(draft: Partial<PlaceFormValues> | null): Where | null {
  if (!draft?.lat || !draft.lng) return null;
  const lat = Number(draft.lat);
  const lng = Number(draft.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    position: { lat, lng },
    name: draft.name ?? "",
    address: draft.address ?? "",
    googleMapsUrl: draft.googleMapsUrl ?? "",
    googlePlaceId: draft.googlePlaceId ?? "",
  };
}

export function NewPlaceWizard({
  categories,
  center,
}: {
  categories: Category[];
  center: [number, number];
}) {
  const [step, setStep] = useState<1 | 2>(1);

  // Rascunho da aba (o celular fecha aba fácil). Vem do storage na hidratação.
  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getServerDraftSnapshot);
  // Última versão dos campos do passo 2, pra ida-e-volta entre passos não perder nada.
  const [formValues, setFormValues] = useState<PlaceFormValues | null>(null);

  // Estado do passo 1: enquanto ninguém mexeu, vale o que veio do rascunho.
  const [edited, setEdited] = useState<Where | null>(null);
  const where = edited ?? whereFromDraft(draft) ?? EMPTY_WHERE;
  const { position, name, address, googleMapsUrl, googlePlaceId } = where;

  // Atualização funcional de propósito: o reverse geocoding responde depois do toque no mapa,
  // e com um closure velho ele sobrescreveria a posição recém-marcada com `null`.
  const setWhere = useCallback(
    (changes: Partial<Where>) => {
      setEdited((prev) => ({ ...(prev ?? whereFromDraft(draft) ?? EMPTY_WHERE), ...changes }));
    },
    [draft],
  );

  const applyResult = useCallback(
    (next: { lat: number; lng: number; name?: string | null; address?: string | null }) => {
      setWhere({
        position: { lat: next.lat, lng: next.lng },
        ...(next.name ? { name: next.name } : {}),
        ...(next.address ? { address: next.address } : {}),
      });
    },
    [setWhere],
  );

  const handleValuesChange = useCallback((values: PlaceFormValues) => {
    setFormValues(values);
    saveDraft(values);
  }, []);

  const initial: Partial<PlaceFormValues> = {
    ...(formValues ?? draft),
    name,
    address,
    lat: position ? String(position.lat) : "",
    lng: position ? String(position.lng) : "",
    googleMapsUrl,
    googlePlaceId,
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        {step === 2 ? (
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => setStep(1)}
            aria-label="Voltar pro passo anterior"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Button>
        ) : null}
        <div className="flex flex-1 flex-col">
          <p className="text-muted-foreground text-xs font-medium">
            {step} de {TOTAL_STEPS}
          </p>
          <h1 className="font-display text-xl">{step === 1 ? "Onde?" : "O quê?"}</h1>
        </div>
      </header>

      <div className="bg-secondary h-1 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {step === 1 ? (
        <StepWhere
          center={center}
          position={position}
          name={name}
          address={address}
          onPosition={(value) => setWhere({ position: value })}
          onAddress={(value) => setWhere({ address: value })}
          onName={(value) => setWhere({ name: value })}
          onResolved={applyResult}
          onMapsLink={(parsed) => {
            setWhere({
              position: { lat: parsed.lat, lng: parsed.lng },
              googleMapsUrl: parsed.canonicalUrl,
              googlePlaceId: parsed.placeId ?? "",
              ...(parsed.name ? { name: parsed.name } : {}),
            });
          }}
          onContinue={() => setStep(2)}
        />
      ) : (
        <PlaceForm
          categories={categories}
          initial={initial}
          action={createPlace}
          canEditCore
          showPositionPicker
          center={center}
          submitLabel="Salvar lugar"
          onValuesChange={handleValuesChange}
          onSubmitStart={clearDraft}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ passo 1 */

function StepWhere({
  center,
  position,
  name,
  address,
  onPosition,
  onAddress,
  onName,
  onResolved,
  onMapsLink,
  onContinue,
}: {
  center: [number, number];
  position: LatLng | null;
  name: string;
  address: string;
  onPosition: (value: LatLng) => void;
  onAddress: (value: string) => void;
  onName: (value: string) => void;
  onResolved: (value: {
    lat: number;
    lng: number;
    name?: string | null;
    address?: string | null;
  }) => void;
  onMapsLink: (parsed: ParsedMapsLink) => void;
  onContinue: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  // "Estou aqui agora" abre o mapa já pedindo o GPS; "Abrir o mapa" cai no Centro.
  const [autoLocate, setAutoLocate] = useState(false);

  // Ao mover o pino, o endereço vem do reverse geocoding (docs/01).
  const fillAddressFromPosition = useCallback(
    async (value: LatLng) => {
      try {
        const response = await fetch(`/api/geocode/reverse?lat=${value.lat}&lng=${value.lng}`, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { address?: string | null };
        if (data.address) onAddress(data.address);
      } catch {
        // Sem endereço automático: dá pra digitar no passo 2.
      }
    },
    [onAddress],
  );

  function handlePickerChange(value: LatLng) {
    onPosition(value);
    void fillAddressFromPosition(value);
  }

  return (
    <div className="flex flex-col gap-4">
      <MapsLinkBox onParsed={onMapsLink} onOpenPicker={() => setShowPicker(true)} />
      <SearchBox
        onPick={(result) => {
          onResolved({
            lat: result.lat,
            lng: result.lng,
            name: result.name,
            address: result.address,
          });
        }}
      />

      <section className="border-border flex flex-col gap-2 rounded-xl border p-3">
        <h2 className="text-sm font-medium">Marcar no mapa</h2>
        {showPicker || position ? null : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="h-11 flex-1"
              onClick={() => {
                setAutoLocate(true);
                setShowPicker(true);
              }}
            >
              <LocateFixed className="size-4" aria-hidden />
              Estou aqui agora
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 flex-1"
              onClick={() => setShowPicker(true)}
            >
              <MapPin className="size-4" aria-hidden />
              Abrir o mapa
            </Button>
          </div>
        )}
        {showPicker || position ? (
          <>
            <LocationPickerLazy
              value={position}
              onChange={handlePickerChange}
              center={center}
              autoLocate={autoLocate}
              className="border-border h-56 overflow-hidden rounded-lg border"
            />
            <p className="text-muted-foreground text-xs">
              Toque no mapa ou arraste o pino. O endereço se preenche sozinho. O botão de alvo pede
              sua localização.
            </p>
          </>
        ) : null}
      </section>

      {position ? (
        <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3">
          <h2 className="text-sm font-medium">Confere aí</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-name">Nome</Label>
            <Input
              id="wizard-name"
              value={name}
              onChange={(event) => onName(event.target.value)}
              placeholder="Nome do lugar"
              maxLength={120}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-address">Endereço</Label>
            <Input
              id="wizard-address"
              value={address}
              onChange={(event) => onAddress(event.target.value)}
              placeholder="Rua, número, bairro"
              maxLength={240}
              className="h-11"
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </p>
        </section>
      ) : null}

      <Button size="lg" className="h-12 text-base" disabled={!position} onClick={onContinue}>
        Continuar
      </Button>
      {!position ? (
        <p className="text-muted-foreground text-center text-xs">
          Escolhe a posição de um dos três jeitos aí em cima.
        </p>
      ) : null}
    </div>
  );
}

function MapsLinkBox({
  onParsed,
  onOpenPicker,
}: {
  onParsed: (parsed: ParsedMapsLink) => void;
  onOpenPicker: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/maps-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await response.json()) as { result?: ParsedMapsLink; error?: string };
      if (!response.ok || !data.result) {
        setError(data.error ?? "Não consegui ler esse link. Marca no mapa?");
        return;
      }
      onParsed(data.result);
    } catch {
      setError("Não consegui ler esse link. Marca no mapa?");
    } finally {
      setLoading(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      setUrl(text);
      await resolve(text);
    } catch {
      // Sem permissão de clipboard: a pessoa cola na mão. Nada de alerta.
    }
  }

  return (
    <section className="border-border flex flex-col gap-2 rounded-xl border p-3">
      <Label htmlFor="wizard-maps-link" className="text-sm font-medium">
        Cole o link do Google Maps
      </Label>
      <div className="flex gap-2">
        <Input
          id="wizard-maps-link"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://maps.app.goo.gl/…"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-11"
        />
        <Button
          variant="outline"
          size="icon-lg"
          className="size-11 shrink-0"
          onClick={paste}
          aria-label="Colar link"
        >
          <ClipboardPaste className="size-4" aria-hidden />
        </Button>
      </div>
      <Button
        size="lg"
        variant="secondary"
        className="h-11"
        disabled={loading || url.trim().length === 0}
        onClick={() => void resolve(url)}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {loading ? "Lendo o link…" : "Usar esse link"}
      </Button>
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
          <Button variant="ghost" size="sm" onClick={onOpenPicker}>
            Marcar no mapa
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function SearchBox({ onPick }: { onPick: (result: GeocodeResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    // Debounce de 400 ms: exigência do Photon/Nominatim (docs/05).
    const timer = setTimeout(async () => {
      if (term.length < 3) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { results?: GeocodeResult[] };
        setResults(data.results ?? []);
      } catch {
        // Abortado ou offline: some a lista e pronto.
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="border-border flex flex-col gap-2 rounded-xl border p-3">
      <Label htmlFor="wizard-search" className="text-sm font-medium">
        Buscar por nome
      </Label>
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="wizard-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sebo do João, Felipe Schmidt…"
          className="h-11 pl-9"
        />
      </div>
      {loading ? <p className="text-muted-foreground text-xs">Procurando…</p> : null}
      {results.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng},${result.label}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(result);
                  setResults([]);
                  setQuery(result.name);
                }}
                className={cn(
                  "hover:bg-secondary focus-visible:ring-ring/50 flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-3",
                )}
              >
                <span className="text-sm font-medium">{result.name}</span>
                <span className="text-muted-foreground text-xs">{result.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
