const BASE = import.meta.env.BASE_URL;

/** Join a path onto the app's base so the site can live under /music/. */
export const appUrl = (path: string): string => `${BASE}${path.replace(/^\/+/, "")}`;

export const apiUrl = (path: string): string => appUrl(path);
