"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import type { LocationPickerProps } from "./location-picker";

export const LocationPickerLazy = dynamic<LocationPickerProps>(
  () => import("./location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
);
