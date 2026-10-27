// A slide's avatar video plays inside a placeholder: an image element tagged
// `video_placeholder`, anywhere in the slide's `ui`. The backend adds it when a
// video is uploaded and removes it when the video is deleted
// (services/slide_video_service.py); these helpers keep the editor's copy of
// the slide in step, since autosave writes the whole `ui` back.

type UnknownRecord = Record<string, unknown>;

export const VIDEO_PLACEHOLDER_FLAG = "video_placeholder";

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isVideoPlaceholderElement(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    value.type === "image" &&
    value[VIDEO_PLACEHOLDER_FLAG] === true
  );
}

export function findVideoPlaceholder(ui: unknown): UnknownRecord | null {
  if (isVideoPlaceholderElement(ui)) return ui;
  const children = Array.isArray(ui)
    ? ui
    : isRecord(ui)
      ? Object.values(ui)
      : [];
  for (const child of children) {
    const found = findVideoPlaceholder(child);
    if (found) return found;
  }
  return null;
}

// Copy of `value` with every placeholder passed through `replace`; a placeholder
// it returns `undefined` for is dropped from lists and nulled in objects, as
// the backend does.
function mapPlaceholders(
  value: unknown,
  replace: (placeholder: UnknownRecord) => UnknownRecord | undefined,
): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isVideoPlaceholderElement(item)) return [mapPlaceholders(item, replace)];
      const next = replace(item);
      return next === undefined ? [] : [next];
    });
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        isVideoPlaceholderElement(child)
          ? (replace(child) ?? null)
          : mapPlaceholders(child, replace),
      ]),
    );
  }
  return value;
}

/**
 * The slide `ui` holding `placeholder`, as the server just stored it.
 *
 * A placeholder the slide already has stays where it is in the tree and keeps
 * the position and size the editor gave it; otherwise `placeholder` is added
 * on top of the slide.
 */
export function withVideoPlaceholder(
  ui: UnknownRecord | null | undefined,
  placeholder: UnknownRecord,
): UnknownRecord {
  let placed = false;
  const next = mapPlaceholders(ui ?? {}, (current) => {
    if (placed) return undefined;
    placed = true;
    return {
      ...current,
      ...placeholder,
      position: current.position ?? placeholder.position,
      size: current.size ?? placeholder.size,
    };
  }) as UnknownRecord;
  if (placed) return next;
  const elements = Array.isArray(next.elements) ? next.elements : [];
  return { ...next, elements: [...elements, { ...placeholder }] };
}

export function withoutVideoPlaceholder(ui: UnknownRecord): UnknownRecord {
  return mapPlaceholders(ui, () => undefined) as UnknownRecord;
}
