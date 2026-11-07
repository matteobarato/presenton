import type { RawUi } from '@/slide-editor/model'

const textComponent = () => ({
  id: 'c-text',
  description: 'Text',
  position: { x: 100, y: 80 },
  elements: [
    {
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 120 },
      text: 'Hello',
      font: { family: 'Arial', size: 24, color: '1A2B45' },
    },
  ],
})

const imageComponent = () => ({
  id: 'c-image',
  description: 'Image',
  position: { x: 600, y: 200 },
  elements: [
    {
      type: 'image',
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      src: '/static/a.png',
    },
  ],
})

const rootBackground = () => ({ background: { color: 'FFFFFF' } })

export function uiWithText(): RawUi {
  return { ...rootBackground(), components: [textComponent()] } as RawUi
}

export function uiWithImage(): RawUi {
  return { ...rootBackground(), components: [imageComponent()] } as RawUi
}

export function uiTwoComponents(): RawUi {
  return { ...rootBackground(), components: [textComponent(), imageComponent()] } as RawUi
}

// uiWithText plus a root video placeholder layer (see video-placeholder.ts).
export function uiWithVideoPlaceholder(): RawUi {
  const ui = uiWithText() as Record<string, unknown>
  return {
    ...ui,
    components: [
      ...(ui.components as unknown[]),
      {
        id: 'video_placeholder',
        description: 'Avatar video placeholder',
        position: { x: 900, y: 400 },
        elements: [
          {
            type: 'image',
            video_placeholder: true,
            position: { x: 0, y: 0 },
            size: { width: 240, height: 240 },
            src: '',
          },
        ],
      },
    ],
  } as RawUi
}

// uiTwoComponents with a second text component overlapping the first (drawn later).
export function uiOverlapping(): RawUi {
  const ui = uiWithText() as Record<string, unknown>
  const first = (ui.components as Record<string, unknown>[])[0]
  return {
    ...ui,
    components: [
      first,
      { ...first, id: 'c-over', position: { x: 150, y: 100 } },
    ],
  } as RawUi
}

// uiWithText plus a decorative full-slide root vector behind everything.
export function uiWithDecorativeBackground(): RawUi {
  return {
    ...(uiWithText() as Record<string, unknown>),
    elements: [
      {
        type: 'vector',
        decorative: true,
        position: { x: 0, y: 0 },
        size: { width: 1280, height: 720 },
      },
    ],
  } as RawUi
}
