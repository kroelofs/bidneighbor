// Helpers for the Google Places (New) integration. The route handlers proxy
// Google so the API key stays a server-side secret; these pure functions shape
// the responses and are unit-tested without network access.

export interface PlaceAddress {
  street_address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
  formatted: string;
}

interface GooglePlaceComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface GooglePlaceDetails {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: GooglePlaceComponent[];
}

interface GoogleSuggestion {
  placePrediction?: { placeId?: string; text?: { text?: string } };
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

/** Flatten Google's autocomplete suggestions into a minimal {placeId, description} list. */
export function parseSuggestions(body: { suggestions?: GoogleSuggestion[] }): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = [];
  for (const s of body.suggestions ?? []) {
    const p = s.placePrediction;
    if (p?.placeId && p.text?.text) out.push({ placeId: p.placeId, description: p.text.text });
  }
  return out;
}

function pick(components: GooglePlaceComponent[], type: string, short = false): string {
  const c = components.find((x) => x.types?.includes(type));
  return (short ? c?.shortText : c?.longText) ?? "";
}

/** Map Google Place Details (New) into our structured address fields. */
export function parsePlaceDetails(d: GooglePlaceDetails): PlaceAddress {
  const comps = d.addressComponents ?? [];
  const streetNumber = pick(comps, "street_number");
  const route = pick(comps, "route");
  const city =
    pick(comps, "locality") ||
    pick(comps, "postal_town") ||
    pick(comps, "sublocality") ||
    pick(comps, "administrative_area_level_2");
  const lat = d.location?.latitude;
  const lng = d.location?.longitude;
  return {
    street_address: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state: pick(comps, "administrative_area_level_1", true),
    zip: pick(comps, "postal_code"),
    latitude: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
    longitude: typeof lng === "number" && Number.isFinite(lng) ? lng : null,
    formatted: d.formattedAddress ?? "",
  };
}
