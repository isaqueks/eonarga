"use client";

import { Loader2, LocateFixed, MapPin, Search, Store, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { EMPTY_FORM_STATE } from "@/actions/form-state";
import { createPost } from "@/actions/posts";
import { LocationPickerLazy } from "@/components/map/location-picker-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatLatLng, haversineMeters, nearestPlace, POST_BODY_MAX } from "@/lib/posts";
import type { PostPlaceOption } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

/** Os três jeitos de dizer de onde você tá postando. */
type Mode = "gps" | "place" | "map";

interface Chosen {
  placeId: string | null;
  /** Nome do lugar, quando for um lugar cadastrado. */
  placeName: string | null;
  lat: number;
  lng: number;
  address: string | null;
}

const NO_GPS = "Sem GPS. Escolhe o lugar ou marca no mapa.";

/** Endereço a partir do ponto (Nominatim pelo servidor). Sem resposta, fica a coordenada. */
async function fetchAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { address?: string | null };
    return data.address ?? null;
  } catch {
    // Offline ou provedor fora do ar: publica com a coordenada mesmo.
    return null;
  }
}

/** Sem acento e em minúscula, pra busca de "João" achar "joao". */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function chosenLabel(chosen: Chosen): string {
  return chosen.placeName ?? chosen.address ?? formatLatLng(chosen.lat, chosen.lng);
}

/** "a 80 m" / "a 1,2 km" — a distância do lugar na lista, quando o GPS respondeu. */
function formatDistance(meters: number): string {
  if (meters < 1000) return `a ${Math.round(meters / 10) * 10} m`;
  return `a ${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function NewPostForm({
  places,
  center,
}: {
  places: PostPlaceOption[];
  center: [number, number];
}) {
  const [state, formAction, pending] = useActionState(createPost, EMPTY_FORM_STATE);

  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("gps");
  const [gps, setGps] = useState<"locating" | "ok" | "error">("locating");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [nearby, setNearby] = useState<PostPlaceOption | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [editing, setEditing] = useState(true);

  // O GPS responde depois; sem estes refs ele sobrescreveria uma escolha já feita.
  const modeRef = useRef(mode);
  const chosenRef = useRef(chosen);
  const placesRef = useRef(places);
  useEffect(() => {
    modeRef.current = mode;
    chosenRef.current = chosen;
    placesRef.current = places;
  }, [mode, chosen, places]);

  const commit = useCallback((value: Chosen) => {
    chosenRef.current = value;
    setChosen(value);
    setNearby(null);
    setEditing(false);
  }, []);

  /** Pede a posição do navegador. Roda sozinho ao abrir e no "Tentar de novo". */
  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGps("error");
      setMode("place");
      return;
    }

    setGps("locating");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setHere({ lat, lng });
        setGps("ok");

        const near = nearestPlace(placesRef.current, lat, lng);
        const address = await fetchAddress(lat, lng);

        // Alguém já escolheu outra coisa enquanto o GPS pensava: não atropela.
        if (chosenRef.current || modeRef.current !== "gps") return;

        // Perto de um lugar cadastrado, pergunta antes de assumir.
        if (near) {
          setNearby(near.place);
          return;
        }
        commit({ placeId: null, placeName: null, lat, lng, address });
      },
      () => {
        setGps("error");
        if (!chosenRef.current) setMode("place");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  }, [commit]);

  // Tenta sozinho ao abrir a tela: na rua, "onde estou" é o caso comum. O ref segura
  // a segunda chamada do StrictMode (e o pedido de GPS só pode sair do navegador).
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    locate();
  }, [locate]);

  // A URL do preview é do navegador e precisa ser devolvida quando troca ou sai da tela.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setHasPhoto(Boolean(file));
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearPhoto() {
    if (photoInputRef.current) photoInputRef.current.value = "";
    setHasPhoto(false);
    setPreview(null);
  }

  /** "Tirar foto" abre a câmera no celular; "Da galeria" deixa o navegador oferecer os arquivos. */
  function openPhotoPicker(source: "camera" | "gallery") {
    const input = photoInputRef.current;
    if (!input) return;
    if (source === "camera") input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  const canPublish = chosen !== null && (hasPhoto || body.trim().length > 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="placeId" value={chosen?.placeId ?? ""} />
      <input type="hidden" name="lat" value={chosen ? String(chosen.lat) : ""} />
      <input type="hidden" name="lng" value={chosen ? String(chosen.lng) : ""} />
      <input type="hidden" name="address" value={chosen?.address ?? ""} />

      {/* 1. Foto (opcional) */}
      <section className="flex flex-col gap-2">
        {/* Um input só: "Tirar foto" liga o `capture` (abre a câmera no celular) e
            "Da galeria" tira, pra o navegador oferecer os arquivos. */}
        <input
          ref={photoInputRef}
          type="file"
          name="photo"
          accept="image/*"
          className="sr-only"
          aria-label="Foto do post"
          onChange={handlePhotoChange}
        />
        {preview ? (
          <div className="border-border bg-muted relative overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Prévia da foto" className="max-h-80 w-full object-contain" />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="absolute top-2 right-2 h-10"
              onClick={clearPhoto}
            >
              <X className="size-4" aria-hidden />
              Tirar
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 text-base"
              onClick={() => openPhotoPicker("camera")}
            >
              📷 Tirar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 text-base"
              onClick={() => openPhotoPicker("gallery")}
            >
              🖼️ Da galeria
            </Button>
          </div>
        )}
        {state.fieldErrors?.photo ? (
          <p role="alert" className="text-destructive text-xs">
            {state.fieldErrors.photo}
          </p>
        ) : null}
      </section>

      {/* 2. Texto (opcional) */}
      <section className="flex flex-col gap-1">
        <Textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="O que tá rolando?"
          maxLength={POST_BODY_MAX}
          rows={3}
          aria-label="Texto do post"
          aria-invalid={state.fieldErrors?.body ? true : undefined}
          className="max-h-40 min-h-24 text-base"
        />
        <div className="flex items-baseline justify-between gap-2">
          {state.fieldErrors?.body ? (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.body}
            </p>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-xs tabular-nums">
            {body.length}/{POST_BODY_MAX}
          </span>
        </div>
      </section>

      {/* 3. Onde (obrigatório) */}
      <section className="border-border flex flex-col gap-3 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Onde você tá?</h2>
          {chosen && !editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Trocar
            </Button>
          ) : null}
        </div>

        {chosen ? (
          <p className="text-sm leading-5">
            <span aria-hidden>📍 </span>
            <span className="font-semibold">{chosenLabel(chosen)}</span>
          </p>
        ) : null}

        {editing ? (
          <WherePicker
            mode={mode}
            onMode={setMode}
            gps={gps}
            here={here}
            nearby={nearby}
            places={places}
            center={center}
            chosen={chosen}
            onRetryGps={locate}
            onCommit={commit}
          />
        ) : null}
      </section>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={!canPublish || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Publicando…" : "Publicar"}
      </Button>
      {!canPublish ? (
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          Precisa de onde você tá e de uma foto ou um texto.
        </p>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------- onde */

function WherePicker({
  mode,
  onMode,
  gps,
  here,
  nearby,
  places,
  center,
  chosen,
  onRetryGps,
  onCommit,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  gps: "locating" | "ok" | "error";
  here: { lat: number; lng: number } | null;
  nearby: PostPlaceOption | null;
  places: PostPlaceOption[];
  center: [number, number];
  chosen: Chosen | null;
  onRetryGps: () => void;
  onCommit: (value: Chosen) => void;
}) {
  const tabs: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "gps", label: "Onde estou", icon: LocateFixed },
    { id: "place", label: "Escolher lugar", icon: Store },
    { id: "map", label: "Marcar no mapa", icon: MapPin },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={mode === tab.id ? "secondary" : "outline"}
            size="lg"
            className="h-10 flex-1"
            aria-pressed={mode === tab.id}
            onClick={() => onMode(tab.id)}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
          </Button>
        ))}
      </div>

      {mode === "gps" ? (
        <GpsPanel gps={gps} here={here} nearby={nearby} onRetry={onRetryGps} onCommit={onCommit} />
      ) : null}

      {mode === "place" ? <PlaceList places={places} here={here} onCommit={onCommit} /> : null}

      {mode === "map" ? (
        <MapPanel center={center} chosen={chosen} here={here} onCommit={onCommit} />
      ) : null}
    </div>
  );
}

function GpsPanel({
  gps,
  here,
  nearby,
  onRetry,
  onCommit,
}: {
  gps: "locating" | "ok" | "error";
  here: { lat: number; lng: number } | null;
  nearby: PostPlaceOption | null;
  onRetry: () => void;
  onCommit: (value: Chosen) => void;
}) {
  if (gps === "error") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="status" className="text-muted-foreground text-sm">
          {NO_GPS}
        </p>
        <Button type="button" variant="outline" size="lg" className="h-10" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (gps === "locating") {
    return (
      <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Procurando você…
      </p>
    );
  }

  if (nearby && here) {
    return (
      <div className="border-border bg-secondary/40 flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm">
          Você tá no <span className="font-semibold">{nearby.name}</span>?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            className="h-10 flex-1"
            onClick={() =>
              onCommit({
                placeId: nearby.id,
                placeName: nearby.name,
                lat: nearby.lat,
                lng: nearby.lng,
                address: nearby.address,
              })
            }
          >
            Sim
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 flex-1"
            onClick={() =>
              onCommit({
                placeId: null,
                placeName: null,
                lat: here.lat,
                lng: here.lng,
                address: null,
              })
            }
          >
            Não, só o endereço
          </Button>
        </div>
      </div>
    );
  }

  return (
    <p role="status" className="text-muted-foreground text-sm">
      Achei você. Confere aí em cima.
    </p>
  );
}

function PlaceList({
  places,
  here,
  onCommit,
}: {
  places: PostPlaceOption[];
  here: { lat: number; lng: number } | null;
  onCommit: (value: Chosen) => void;
}) {
  const [query, setQuery] = useState("");

  const term = fold(query.trim());
  const filtered = places
    .filter((place) => term === "" || fold(place.name).includes(term))
    .map((place) => ({ place, meters: here ? haversineMeters(here, place) : 0 }));
  // Com GPS, o mais perto primeiro; sem GPS, ordem alfabética (é como vêm do servidor).
  const sorted = here ? [...filtered].sort((a, b) => a.meters - b.meters) : filtered;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Procurar lugar"
          aria-label="Procurar lugar"
          className="h-11 pl-9"
        />
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">
          {places.length === 0 ? "Nenhum lugar cadastrado ainda." : "Nada com esse nome."}
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {sorted.slice(0, 50).map(({ place, meters }) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() =>
                  onCommit({
                    placeId: place.id,
                    placeName: place.name,
                    lat: place.lat,
                    lng: place.lng,
                    address: place.address,
                  })
                }
                className={cn(
                  "hover:bg-secondary focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-3",
                )}
              >
                <span aria-hidden>{place.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{place.name}</span>
                {here ? (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDistance(meters)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MapPanel({
  center,
  chosen,
  here,
  onCommit,
}: {
  center: [number, number];
  chosen: Chosen | null;
  here: { lat: number; lng: number } | null;
  onCommit: (value: Chosen) => void;
}) {
  const value = chosen ? { lat: chosen.lat, lng: chosen.lng } : null;

  async function handleChange(next: { lat: number; lng: number }) {
    onCommit({ placeId: null, placeName: null, lat: next.lat, lng: next.lng, address: null });
    const address = await fetchAddress(next.lat, next.lng);
    if (!address) return;
    onCommit({ placeId: null, placeName: null, lat: next.lat, lng: next.lng, address });
  }

  return (
    <div className="flex flex-col gap-2">
      <LocationPickerLazy
        value={value}
        onChange={handleChange}
        center={here ? [here.lat, here.lng] : center}
        className="border-border h-56 overflow-hidden rounded-lg border"
      />
      <p className="text-muted-foreground text-xs">
        Toque no mapa ou arraste o pino. O endereço se preenche sozinho.
      </p>
    </div>
  );
}
