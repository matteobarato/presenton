// Shim for servers/nextjs/utils/api.ts @ 7cb5ab44. Local copy of the asset and
// error helpers the renderer uses, with fixed same-origin behaviour (no
// Electron / FastAPI URL override), so relative backend paths stay relative.
import { extractApiErrorMessage } from "./apiErrorMessages";

export type BackendAssetLike = {
  file_url?: string | null;
  path?: string | null;
  url?: string | null;
};

function isAbsoluteHttpUrl(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveBackendPathForRuntime(path: string): string {
  return withLeadingSlash(path);
}

function isLocalBackendOrigin(origin: string): boolean {
  return typeof window !== "undefined" && window.location?.origin === origin;
}

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const errorData: unknown = await response.clone().json();
    return extractApiErrorMessage(errorData, fallbackMessage, response.status);
  } catch {
    try {
      const text = await response.text();
      return extractApiErrorMessage(text, fallbackMessage, response.status);
    } catch {
      return fallbackMessage;
    }
  }
}

function hasBackendAssetPrefix(path: string): boolean {
  return path.startsWith("/static/") || path.startsWith("/app_data/");
}

function toBackendServedPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");

  // Never rewrite assets served from the Next.js application itself.
  if (
    normalized.startsWith("/_next/static/") ||
    normalized.startsWith("/vendor/fonts/")
  ) {
    return normalized;
  }

  const appDataIdx = normalized.indexOf("/app_data/");
  if (appDataIdx !== -1) {
    return normalized.slice(appDataIdx);
  }

  const staticIdx = normalized.indexOf("/static/");
  if (staticIdx !== -1) {
    return normalized.slice(staticIdx);
  }

  const imagesIdx = normalized.lastIndexOf("/images/");
  if (imagesIdx !== -1) {
    return `/app_data${normalized.slice(imagesIdx)}`;
  }

  const uploadsIdx = normalized.lastIndexOf("/uploads/");
  if (uploadsIdx !== -1) {
    return `/app_data${normalized.slice(uploadsIdx)}`;
  }

  const fontsIdx = normalized.lastIndexOf("/fonts/");
  if (fontsIdx !== -1) {
    return `/app_data${normalized.slice(fontsIdx)}`;
  }

  return normalized;
}

function splitPathAndSuffix(value: string): { path: string; suffix: string } {
  const hashIdx = value.indexOf("#");
  const queryIdx = value.indexOf("?");
  const firstSuffixIdx =
    hashIdx === -1
      ? queryIdx
      : queryIdx === -1
        ? hashIdx
        : Math.min(queryIdx, hashIdx);

  if (firstSuffixIdx === -1) {
    return { path: value, suffix: "" };
  }

  return {
    path: value.slice(0, firstSuffixIdx),
    suffix: value.slice(firstSuffixIdx),
  };
}

export function resolveBackendAssetUrl(path?: string): string {
  if (!path) return "";

  const trimmedPath = path.trim();
  if (!trimmedPath) return "";

  if (trimmedPath.startsWith("data:") || trimmedPath.startsWith("blob:")) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith("file:")) {
    try {
      const parsed = new URL(trimmedPath);
      const servedPath = toBackendServedPath(decodeURIComponent(parsed.pathname));
      if (hasBackendAssetPrefix(servedPath)) {
        return resolveBackendPathForRuntime(servedPath);
      }
      return trimmedPath;
    } catch {
      return trimmedPath;
    }
  }

  if (isAbsoluteHttpUrl(trimmedPath)) {
    try {
      const parsed = new URL(trimmedPath);
      // Assets returned by Presenton cloud (or any other remote origin) must
      // retain their complete URL. Only URLs that point at this deployment's
      // own backend are normalized to the runtime's local/reverse-proxy path.
      if (!isLocalBackendOrigin(parsed.origin)) {
        return trimmedPath;
      }
      const servedPath = toBackendServedPath(parsed.pathname);
      if (hasBackendAssetPrefix(servedPath)) {
        return resolveBackendPathForRuntime(
          `${servedPath}${parsed.search}${parsed.hash}`
        );
      }
      return trimmedPath;
    } catch {
      return trimmedPath;
    }
  }

  const { path: pathPart, suffix } = splitPathAndSuffix(trimmedPath);
  const servedPath = toBackendServedPath(withLeadingSlash(pathPart));
  if (hasBackendAssetPrefix(servedPath)) {
    return resolveBackendPathForRuntime(`${servedPath}${suffix}`);
  }

  return trimmedPath;
}

export function getBackendAssetSource(
  asset: BackendAssetLike | string | null | undefined
): string {
  if (typeof asset === "string") {
    return asset;
  }

  if (!asset) {
    return "";
  }

  return (asset.file_url || asset.path || asset.url || "").trim();
}

export function resolveBackendAssetSource(
  asset: BackendAssetLike | string | null | undefined
): string {
  return resolveBackendAssetUrl(getBackendAssetSource(asset));
}

function isAssetLikeString(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;

  if (/^(?:https?:|data:|blob:|file:)/i.test(candidate)) {
    return true;
  }

  const { path } = splitPathAndSuffix(candidate);
  const normalizedPath = path.replace(/\\/g, "/");
  const startsLikePath =
    normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("./") ||
    normalizedPath.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalizedPath) ||
    /^(?:static|app_data|images|uploads|fonts)\//.test(normalizedPath);

  if (!startsLikePath) return false;

  return hasBackendAssetPrefix(
    toBackendServedPath(withLeadingSlash(normalizedPath))
  );
}

export const normalizeBackendAssetUrls = <T,>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeBackendAssetUrls(item)) as T;
  }

  if (input && typeof input === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>
    )) {
      normalized[key] =
        typeof value === "string"
          ? isAssetLikeString(value)
            ? resolveBackendAssetUrl(value)
            : value
          : normalizeBackendAssetUrls(value);
    }
    return normalized as T;
  }

  return input;
};
