import type { UserRow } from "../types";

/** Public-safe user shape — NEVER includes email or phone. */
export function publicUser(u: Pick<UserRow, "id" | "name" | "town" | "county" | "provider_bio">) {
  return {
    id: u.id,
    name: u.name,
    town: u.town,
    county: u.county,
    provider_bio: u.provider_bio,
  };
}

/** Full self shape for /api/me — safe to send to the user about themselves. */
export function selfUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    admin_level: u.admin_level,
    auth_provider: u.auth_provider,
    town: u.town,
    county: u.county,
    street_address: u.street_address,
    city: u.city,
    state: u.state,
    zip: u.zip,
    latitude: u.latitude,
    longitude: u.longitude,
    provider_bio: u.provider_bio,
    avatar_url: u.avatar_url,
    theme_preference: u.theme_preference,
    status: u.status,
    notify_new_tasks: u.notify_new_tasks,
    notify_responses: u.notify_responses,
  };
}
