// Default market. Multi-county expansion just adds entries here (and later, a DB table).
export const DEFAULT_COUNTY = "Sioux County";

export const COUNTIES: { county: string; towns: string[] }[] = [
  {
    county: "Sioux County",
    towns: [
      "Hull",
      "Sioux Center",
      "Orange City",
      "Rock Valley",
      "Boyden",
      "Hospers",
      "Alton",
      "Ireton",
      "Maurice",
      "Hawarden",
    ],
  },
];

export function townsForCounty(county: string): string[] {
  return COUNTIES.find((c) => c.county === county)?.towns ?? [];
}
