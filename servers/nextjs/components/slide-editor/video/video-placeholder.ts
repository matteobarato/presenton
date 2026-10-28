// A slide's avatar video plays inside a placeholder: an image element tagged
// `video_placeholder`, anywhere in the slide's `ui`. The backend adds it when a
// video is uploaded and removes it when the video is deleted
// (services/slide_video_service.py); these helpers keep the editor's copy of
// the slide in step, since autosave writes the whole `ui` back.
//
// The placeholder sits in a component of its own, like an image inserted in
// the editor, so its place in `components` is its layer: the export draws the
// slide content above it over the avatar.

type UnknownRecord = Record<string, unknown>;
type StageBox = { x: number; y: number; width: number; height: number };

export const VIDEO_PLACEHOLDER_FLAG = "video_placeholder";
// Matches VIDEO_PLACEHOLDER_COMPONENT_ID in services/slide_video_service.py.
export const VIDEO_PLACEHOLDER_COMPONENT_ID = "video_placeholder";
const VIDEO_PLACEHOLDER_COMPONENT_DESCRIPTION = "Avatar video placeholder";
// The avatar fills its placeholder, cropping the overflow, as the MP4 export
// draws it (AVATAR_FIT in services/slide_video_service.py). Placeholders made
// before this stored `fill`, which stretched the face, so the stored `fit` is
// never read.
export const AVATAR_FIT = "cover";

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPosition(value: UnknownRecord): { x: number; y: number } {
  const position = isRecord(value.position) ? value.position : {};
  return { x: readNumber(position.x) ?? 0, y: readNumber(position.y) ?? 0 };
}

export function isVideoPlaceholderElement(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    value.type === "image" &&
    value[VIDEO_PLACEHOLDER_FLAG] === true
  );
}

export function withAvatarFit(placeholder: UnknownRecord): UnknownRecord {
  return { ...placeholder, fit: AVATAR_FIT };
}

// The first placeholder in the tree, with the stage offset its own `position`
// is relative to: a component's elements and a group's children are placed
// from their parent's position, as the editor draws them.
function locateVideoPlaceholder(
  value: unknown,
  offset = { x: 0, y: 0 },
): { placeholder: UnknownRecord; offset: { x: number; y: number } } | null {
  if (isVideoPlaceholderElement(value)) return { placeholder: value, offset };
  let children: unknown[] = [];
  let childOffset = offset;
  if (Array.isArray(value)) {
    children = value;
  } else if (isRecord(value)) {
    children = Object.values(value);
    const position = readPosition(value);
    childOffset = { x: offset.x + position.x, y: offset.y + position.y };
  }
  for (const child of children) {
    const found = locateVideoPlaceholder(child, childOffset);
    if (found) return found;
  }
  return null;
}

export function findVideoPlaceholder(ui: unknown): UnknownRecord | null {
  return locateVideoPlaceholder(ui)?.placeholder ?? null;
}

/** The slide's placeholder on the stage, in stage pixels. */
export function findVideoPlaceholderBox(ui: unknown): StageBox | null {
  const located = locateVideoPlaceholder(ui);
  if (!located) return null;
  const { placeholder, offset } = located;
  const position = isRecord(placeholder.position) ? placeholder.position : {};
  const size = isRecord(placeholder.size) ? placeholder.size : {};
  const x = readNumber(position.x);
  const y = readNumber(position.y);
  const width = readNumber(size.width);
  const height = readNumber(size.height);
  if (x === null || y === null || width === null || height === null) return null;
  return { x: offset.x + x, y: offset.y + y, width, height };
}

// `placeholder`, placed at `box` on the stage, in a component of its own.
function placeholderComponent(
  placeholder: UnknownRecord,
  box: { x: number; y: number },
): UnknownRecord {
  return {
    id: VIDEO_PLACEHOLDER_COMPONENT_ID,
    description: VIDEO_PLACEHOLDER_COMPONENT_DESCRIPTION,
    position: { x: box.x, y: box.y },
    elements: [{ ...placeholder, position: { x: 0, y: 0 } }],
  };
}

function readComponents(ui: UnknownRecord): unknown[] {
  return Array.isArray(ui.components) ? ui.components : [];
}

/**
 * `ui` with a placeholder kept in the slide's root `elements`, as placeholders
 * were before they could be layered, moved into a component on top of the
 * slide: where every export drew the avatar then. `ui` itself when there is
 * nothing to move.
 */
export function liftRootVideoPlaceholder<T extends UnknownRecord>(ui: T): T {
  const elements = Array.isArray(ui.elements) ? ui.elements : [];
  const lifted = elements.filter(isVideoPlaceholderElement);
  if (lifted.length === 0) return ui;
  return {
    ...ui,
    elements: elements.filter((item) => !isVideoPlaceholderElement(item)),
    components: [
      ...readComponents(ui),
      ...lifted.map((placeholder) =>
        placeholderComponent(placeholder, readPosition(placeholder)),
      ),
    ],
  };
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
 * The slide `ui` holding the placeholder of `serverUi`, the slide as the
 * server just stored it.
 *
 * A placeholder the slide already has stays where it is in the tree and keeps
 * the position and size the editor gave it; otherwise the server's is added,
 * in a component of its own, on top of the slide.
 */
export function withVideoPlaceholder(
  ui: UnknownRecord | null | undefined,
  serverUi: unknown,
): UnknownRecord {
  const current = liftRootVideoPlaceholder(ui ?? {});
  const placeholder = findVideoPlaceholder(serverUi);
  const box = findVideoPlaceholderBox(serverUi);
  if (!placeholder) return current;
  let placed = false;
  const next = mapPlaceholders(current, (local) => {
    if (placed) return undefined;
    placed = true;
    return {
      ...local,
      ...placeholder,
      position: local.position ?? placeholder.position,
      size: local.size ?? placeholder.size,
    };
  }) as UnknownRecord;
  if (placed) return next;
  return {
    ...next,
    components: [
      ...readComponents(next),
      placeholderComponent(placeholder, box ?? readPosition(placeholder)),
    ],
  };
}

function holdsOnlyPlaceholders(component: unknown): boolean {
  const elements = isRecord(component) ? component.elements : null;
  return (
    Array.isArray(elements) &&
    elements.length > 0 &&
    elements.every(isVideoPlaceholderElement)
  );
}

/** A top-level item that is a placeholder, or a component holding only one. */
export function isVideoPlaceholderLayer(item: unknown): boolean {
  return isVideoPlaceholderElement(item) || holdsOnlyPlaceholders(item);
}

/** `ui` without any placeholder, nor any component that held nothing else. */
export function withoutVideoPlaceholder(ui: UnknownRecord): UnknownRecord {
  const next = mapPlaceholders(ui, () => undefined) as UnknownRecord;
  if (!Array.isArray(ui.components)) return next;
  return {
    ...next,
    components: ui.components
      .filter((component) => !holdsOnlyPlaceholders(component))
      .map((component) => mapPlaceholders(component, () => undefined)),
  };
}
