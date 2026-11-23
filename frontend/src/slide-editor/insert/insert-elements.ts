// Ported from servers/nextjs/components/slide-editor/insert/insert-elements.ts (item lists and icons from
// app/(presentation-generator)/presentation/components/PresentationActions.tsx). Changes: dropped the chart,
// infographic, table and math/LaTeX presets and their theming; rewired imports to the legacy renderer ports;
// added TEXT_INSERT_ITEMS, IMAGE_INSERT_ITEMS and ELEMENT_ICONS (lucide-vue-next); defined
// TemplateV2InsertComponent and EditorInsertContent locally.
import type { Component } from 'vue'
import { i18n } from '@/i18n'
import {
  ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight, Bookmark, Circle,
  Cloud, Columns2, Diamond, Droplet, Flag, Grid3X3, Heart, Hexagon, Home, Image, List, ListOrdered,
  MessageSquare, Minus, Moon, Move, Octagon, Pentagon, Play, Plus, Quote, RectangleHorizontal, Shapes,
  Shield, Sun, Star, Text, Triangle, X, Zap, ChevronsRight, Heading, Heading2,
} from 'lucide-vue-next'
import {
  measureNoWrapTextWidth,
  rawFont,
} from "@/render/legacy/components/slide-editor/text/template-v2-text";
import type {
  Fill,
  Font,
  Marker,
  SlideElement,
  Stroke,
} from "@/render/legacy/components/slide-editor/types";
import {
  DEFAULT_TEMPLATE_THEME,
  type TemplateTheme,
} from "@/render/legacy/lib/template-theme";

const DEFAULT_IMAGE_PLACEHOLDER_SRC = "/placeholder.jpg";
const TEXT_INSERT_HORIZONTAL_PADDING_PX = 8;
const TEXT_INSERT_VERTICAL_PADDING_PX = 14;
const IMAGE_RADIUS = { tl: 10, tr: 10, bl: 10, br: 10 };

export type InsertItem = { id: string; label: string; icon: Component }

export const TEXT_INSERT_ITEMS: InsertItem[] = [
  { id: 'title-block', get label() { return i18n.global.t('slideEditor.insert.item.titleBlock') }, icon: Heading },
  { id: 'subtitle', get label() { return i18n.global.t('slideEditor.insert.item.subtitle') }, icon: Heading2 },
  { id: 'body-text', get label() { return i18n.global.t('slideEditor.insert.item.bodyText') }, icon: Text },
  { id: 'bullet-list', get label() { return i18n.global.t('slideEditor.insert.item.bulletList') }, icon: List },
  { id: 'numbered-list', get label() { return i18n.global.t('slideEditor.insert.item.numberedList') }, icon: ListOrdered },
  { id: 'quote', get label() { return i18n.global.t('slideEditor.insert.item.quote') }, icon: Quote },
]

export const IMAGE_INSERT_ITEMS: InsertItem[] = [
  { id: 'image', get label() { return i18n.global.t('slideEditor.insert.item.image') }, icon: Image },
  { id: 'image-text', get label() { return i18n.global.t('slideEditor.insert.item.imageText') }, icon: Columns2 },
  { id: 'image-grid', get label() { return i18n.global.t('slideEditor.insert.item.imageGrid') }, icon: Grid3X3 },
]

export type TemplateV2InsertComponent = {
  id?: string
  description?: string
  position: { x: number; y: number }
  elements: SlideElement[]
}

export type EditorInsertContent = {
  elements?: SlideElement[];
  components?: TemplateV2InsertComponent[];
};

function fittedTextHeight(
  lineCount: number,
  fontSize: number,
  lineHeight: number,
) {
  return Math.ceil(
    lineCount * fontSize * lineHeight + TEXT_INSERT_VERTICAL_PADDING_PX,
  );
}

function makeTextElement({
  name,
  text,
  x,
  y,
  width,
  height,
  size,
  color = "101323",
  bold = false,
  italic = false,
  lineHeight = 1.1,
  horizontal = "left",
}: {
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  lineHeight?: number;
  horizontal?: "left" | "center" | "right";
}): SlideElement {
  const maxLength = Math.max(1, text.trim().length);

  return {
    type: "text",
    position: { x, y },
    size: { width, height },
    alignment: { horizontal, vertical: "top" },
    runs: [{ text }],
    font: {
      family: "Arial",
      size,
      color,
      bold,
      italic,
      line_height: lineHeight,
    },
    decorative: false,
    name,
    max_length: maxLength,
    min_length: Math.ceil(maxLength / 2),
  };
}

function makeBulletListElement(marker: Marker): SlideElement {
  const baseFont = {
    size: 18,
    family: "Manrope",
    color: "#111111",
    bold: false,
    italic: false,
    line_height: 1.4,
    letter_spacing: 0,
    ellipsis: false,
  };
  const items = [
    [
      {
        text: "Clarify the goal and audience",
        font: { ...baseFont, bold: true },
      },
    ],
    [{ text: "Show the strongest supporting point", font: { ...baseFont } }],
    [
      {
        text: "Close with the next action",
        font: { ...baseFont, italic: true },
      },
    ],
  ];
  const renderFont = rawFont({ font: baseFont });
  const fittedWidth = Math.ceil(
    Math.max(
      ...items.map((item, index) => {
        const prefix =
          marker === "bullet"
            ? "• "
            : marker === "number"
              ? `${index + 1}. `
              : "";
        const text = item.map((run) => run.text).join("");
        return measureNoWrapTextWidth(`${prefix}${text}`, renderFont);
      }),
    ) + TEXT_INSERT_HORIZONTAL_PADDING_PX,
  );

  return {
    type: "text-list",
    position: { x: 122, y: 128 },
    size: {
      width: fittedWidth,
      height: fittedTextHeight(
        items.length,
        baseFont.size,
        baseFont.line_height,
      ),
    },
    rotation: 0,
    font: baseFont,

    marker,
    items,
    decorative: false,
    name:
      marker === "bullet"
        ? "bullet_list"
        : marker === "number"
          ? "numbered_list"
          : "list_item",
    max_items: 6,
    min_items: 3,
    max_item_length: 60,
    min_item_length: 30,
  };
}

function createDefaultTextInsertElements(kind?: string): SlideElement[] {

  switch (kind) {
    case "title-block":
      return [
        makeTextElement({
          name: "slide_title",
          text: "Add a clear slide title",
          x: 109,
          y: 109,
          width: 986,
          height: fittedTextHeight(1, 38, 1.1),
          size: 38,
          bold: true,
        }),
      ];
    case "subtitle":
      return [
        makeTextElement({
          name: "slide_subtitle",
          text: "Add a concise supporting subtitle",
          x: 122,
          y: 154,
          width: 870,
          height: fittedTextHeight(1, 24, 1.2),
          size: 24,
          color: "344054",
          lineHeight: 1.2,
        }),
      ];
    case "bullet-list":
      return [makeBulletListElement("bullet")];
    case "numbered-list":
      return [makeBulletListElement("number")];
    case "list-item":
      return [makeBulletListElement("none")];
    case "quote":
      return [
        makeTextElement({
          name: "quote",
          text: '"Add a memorable quote or customer insight here."',
          x: 122,
          y: 147,
          width: 858,
          height: fittedTextHeight(2, 24, 1.25),
          size: 24,
          color: "101323",
          italic: true,
          lineHeight: 1.25,
        }),
      ];
    case "body-text":
      return [
        makeTextElement({
          name: "body_text",
          text: "Add body text here. Use this space for a short paragraph or supporting detail.",
          x: 122,
          y: 154,
          width: 858,
          height: fittedTextHeight(2, 18, 1.28),
          size: 18,
          color: "344054",
          lineHeight: 1.28,
        }),
      ];
    default:
      return [];
  }
}

function makeImageElement({
  x,
  y,
  width,
  height,
  name = "image",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
}): SlideElement {
  return {
    type: "image",
    position: { x, y },
    size: { width, height },
    data: DEFAULT_IMAGE_PLACEHOLDER_SRC,
    fit: "cover",
    decorative: false,
    name,
    is_icon: false,
    border_radius: IMAGE_RADIUS,
  };
}

function createDefaultImageInsertContent(kind?: string): EditorInsertContent {
  switch (kind) {
    case "image":
      return {
        elements: [
          makeImageElement({
            x: 134,
            y: 128,
            width: 666,
            height: 397,
          }),
        ],
      };
    case "image-text":
      return {
        components: [
          {
            id: "image_text",
            description: "Image with heading and supporting text",
            position: { x: 122, y: 128 },
            elements: [
              makeImageElement({ x: 0, y: 0, width: 486, height: 371 }),
              makeTextElement({
                name: "image_heading",
                text: "Add a heading",
                x: 525,
                y: 15,
                width: 442,
                height: 74,
                size: 24,
                bold: true,
              }),
              makeTextElement({
                name: "image_supporting_text",
                text: "Add supporting text that explains why this visual matters.",
                x: 525,
                y: 108,
                width: 442,
                height: 134,
                size: 16,
                color: "475467",
                lineHeight: 1.3,
              }),
            ],
          },
        ],
      };
    case "image-grid":
      return {
        components: [
          {
            id: "image_grid",
            description: "Two-by-two image grid",
            position: { x: 128, y: 122 },
            elements: [
              makeImageElement({
                x: 0,
                y: 0,
                width: 346,
                height: 211,
                name: "image_1",
              }),
              makeImageElement({
                x: 371,
                y: 0,
                width: 346,
                height: 211,
                name: "image_2",
              }),
              makeImageElement({
                x: 0,
                y: 243,
                width: 346,
                height: 211,
                name: "image_3",
              }),
              makeImageElement({
                x: 371,
                y: 243,
                width: 346,
                height: 211,
                name: "image_4",
              }),
            ],
          },
        ],
      };
    default:
      return {};
  }
}

const DEFAULT_VECTOR_FILL: Fill = { color: "F4F3FF", opacity: 1 };
const DEFAULT_VECTOR_STROKE: Stroke = { color: "7A5AF8", width: 1.5 };
const DEFAULT_VECTOR_LINE_STROKE: Stroke = {
  ...DEFAULT_VECTOR_STROKE,
  width: 2,
};

export const ELEMENT_INSERT_GROUPS = [
  {
    get label() { return i18n.global.t('slideEditor.insert.group.basicShapes') },
    items: [
      { id: "vector-rectangle", get label() { return i18n.global.t('slideEditor.insert.item.rectangle') } },
      { id: "vector-rounded-rectangle", get label() { return i18n.global.t('slideEditor.insert.item.roundedRectangle') } },
      { id: "vector-capsule", get label() { return i18n.global.t('slideEditor.insert.item.capsule') } },
      { id: "vector-circle", get label() { return i18n.global.t('slideEditor.insert.item.circle') } },
      { id: "vector-ellipse", get label() { return i18n.global.t('slideEditor.insert.item.ellipse') } },
      { id: "vector-triangle", get label() { return i18n.global.t('slideEditor.insert.item.triangle') } },
      { id: "vector-right-triangle", get label() { return i18n.global.t('slideEditor.insert.item.rightTriangle') } },
      { id: "vector-diamond", get label() { return i18n.global.t('slideEditor.insert.item.diamond') } },
      { id: "vector-parallelogram", get label() { return i18n.global.t('slideEditor.insert.item.parallelogram') } },
      { id: "vector-trapezoid", get label() { return i18n.global.t('slideEditor.insert.item.trapezoid') } },
      { id: "vector-pentagon", get label() { return i18n.global.t('slideEditor.insert.item.pentagon') } },
      { id: "vector-hexagon", get label() { return i18n.global.t('slideEditor.insert.item.hexagon') } },
      { id: "vector-octagon", get label() { return i18n.global.t('slideEditor.insert.item.octagon') } },
      { id: "vector-teardrop", get label() { return i18n.global.t('slideEditor.insert.item.teardrop') } },
    ],
  },
  {
    get label() { return i18n.global.t('slideEditor.insert.group.linesArrows') },
    items: [
      { id: "vector-line", get label() { return i18n.global.t('slideEditor.insert.item.line') } },
      { id: "vector-line-arrow", get label() { return i18n.global.t('slideEditor.insert.item.lineArrow') } },
      { id: "vector-line-arrow-both", get label() { return i18n.global.t('slideEditor.insert.item.lineArrowBoth') } },
      { id: "vector-line-stealth", get label() { return i18n.global.t('slideEditor.insert.item.lineStealth') } },
      { id: "vector-line-filled", get label() { return i18n.global.t('slideEditor.insert.item.lineFilled') } },
      { id: "vector-line-filled-both", get label() { return i18n.global.t('slideEditor.insert.item.lineFilledBoth') } },
      { id: "vector-line-circle-arrow", get label() { return i18n.global.t('slideEditor.insert.item.lineCircleArrow') } },
      { id: "vector-line-square-arrow", get label() { return i18n.global.t('slideEditor.insert.item.lineSquareArrow') } },
      { id: "vector-line-diamond-arrow", get label() { return i18n.global.t('slideEditor.insert.item.lineDiamondArrow') } },
    ],
  },
  {
    get label() { return i18n.global.t('slideEditor.insert.group.blockArrows') },
    items: [
      { id: "vector-arrow", get label() { return i18n.global.t('slideEditor.insert.item.arrow') } },
      { id: "vector-arrow-left", get label() { return i18n.global.t('slideEditor.insert.item.arrowLeft') } },
      { id: "vector-arrow-up", get label() { return i18n.global.t('slideEditor.insert.item.arrowUp') } },
      { id: "vector-arrow-down", get label() { return i18n.global.t('slideEditor.insert.item.arrowDown') } },
      { id: "vector-arrow-left-right", get label() { return i18n.global.t('slideEditor.insert.item.arrowLeftRight') } },
      { id: "vector-arrow-up-down", get label() { return i18n.global.t('slideEditor.insert.item.arrowUpDown') } },
      { id: "vector-chevron-right", get label() { return i18n.global.t('slideEditor.insert.item.chevronRight') } },
      { id: "vector-notched-arrow", get label() { return i18n.global.t('slideEditor.insert.item.notchedArrow') } },
      { id: "vector-bent-arrow", get label() { return i18n.global.t('slideEditor.insert.item.bentArrow') } },
      { id: "vector-four-way-arrow", get label() { return i18n.global.t('slideEditor.insert.item.fourWayArrow') } },
    ],
  },
  {
    get label() { return i18n.global.t('slideEditor.insert.group.symbols') },
    items: [
      { id: "vector-plus", get label() { return i18n.global.t('slideEditor.insert.item.plus') } },
      { id: "vector-cross", get label() { return i18n.global.t('slideEditor.insert.item.cross') } },
      { id: "vector-lightning", get label() { return i18n.global.t('slideEditor.insert.item.lightning') } },
      { id: "vector-home", get label() { return i18n.global.t('slideEditor.insert.item.home') } },
      { id: "vector-speech-bubble", get label() { return i18n.global.t('slideEditor.insert.item.speechBubble') } },
      { id: "vector-cloud", get label() { return i18n.global.t('slideEditor.insert.item.cloud') } },
      { id: "vector-heart", get label() { return i18n.global.t('slideEditor.insert.item.heart') } },
      { id: "vector-star", get label() { return i18n.global.t('slideEditor.insert.item.star') } },
      { id: "vector-bookmark", get label() { return i18n.global.t('slideEditor.insert.item.bookmark') } },
      { id: "vector-shield", get label() { return i18n.global.t('slideEditor.insert.item.shield') } },
      { id: "vector-flag", get label() { return i18n.global.t('slideEditor.insert.item.flag') } },
      { id: "vector-moon", get label() { return i18n.global.t('slideEditor.insert.item.moon') } },
      { id: "vector-sun", get label() { return i18n.global.t('slideEditor.insert.item.sun') } },
      { id: "vector-play", get label() { return i18n.global.t('slideEditor.insert.item.play') } },
    ],
  },
] as const;

export type ElementInsertKind =
  (typeof ELEMENT_INSERT_GROUPS)[number]["items"][number]["id"];

export const ELEMENT_ICONS: Record<ElementInsertKind, Component> = {
  "vector-rectangle": RectangleHorizontal,
  "vector-rounded-rectangle": RectangleHorizontal,
  "vector-capsule": RectangleHorizontal,
  "vector-circle": Circle,
  "vector-ellipse": Circle,
  "vector-triangle": Triangle,
  "vector-right-triangle": Triangle,
  "vector-diamond": Diamond,
  "vector-parallelogram": Shapes,
  "vector-trapezoid": Shapes,
  "vector-pentagon": Pentagon,
  "vector-hexagon": Hexagon,
  "vector-octagon": Octagon,
  "vector-teardrop": Droplet,
  "vector-line": Minus,
  "vector-line-arrow": ArrowRight,
  "vector-line-arrow-both": ArrowLeftRight,
  "vector-line-stealth": ArrowRight,
  "vector-line-filled": ArrowRight,
  "vector-line-filled-both": ArrowLeftRight,
  "vector-line-circle-arrow": ArrowRight,
  "vector-line-square-arrow": ArrowRight,
  "vector-line-diamond-arrow": ArrowRight,
  "vector-arrow": ArrowRight,
  "vector-arrow-left": ArrowLeft,
  "vector-arrow-up": ArrowUp,
  "vector-arrow-down": ArrowDown,
  "vector-arrow-left-right": ArrowLeftRight,
  "vector-arrow-up-down": ArrowUpDown,
  "vector-chevron-right": ChevronsRight,
  "vector-notched-arrow": ArrowRight,
  "vector-bent-arrow": ArrowUpRight,
  "vector-four-way-arrow": Move,
  "vector-plus": Plus,
  "vector-cross": X,
  "vector-lightning": Zap,
  "vector-home": Home,
  "vector-speech-bubble": MessageSquare,
  "vector-cloud": Cloud,
  "vector-heart": Heart,
  "vector-star": Star,
  "vector-bookmark": Bookmark,
  "vector-shield": Shield,
  "vector-flag": Flag,
  "vector-moon": Moon,
  "vector-sun": Sun,
  "vector-play": Play,
};

function makeVector({
  points,
  shape,
  closed = true,
  fill = DEFAULT_VECTOR_FILL,
  stroke = DEFAULT_VECTOR_STROKE,
  curve,
  cornerRadii,
  startMarker,
  endMarker,
}: {
  points: Array<{ x: number; y: number }>;
  shape?: "polygon" | "ellipse";
  closed?: boolean;
  fill?: Fill | null;
  stroke?: Stroke | null;
  curve?: { type: "smooth"; tension?: number; segments?: number };
  cornerRadii?: number[];
  startMarker?:
    | "arrow"
    | "stealth"
    | "triangle"
    | "circle"
    | "square"
    | "diamond";
  endMarker?:
    | "arrow"
    | "stealth"
    | "triangle"
    | "circle"
    | "square"
    | "diamond";
}): SlideElement {
  return {
    type: "vector",
    ...(shape ? { shape } : {}),
    points,
    closed,
    ...(curve ? { curve } : {}),
    ...(cornerRadii ? { corner_radii: cornerRadii } : {}),
    ...(startMarker ? { start_marker: startMarker } : {}),
    ...(endMarker ? { end_marker: endMarker } : {}),
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
  };
}

function createDefaultElementInsertElements(kind?: string): SlideElement[] {
  switch (kind) {
    case "vector-rectangle":
      return [
        makeVector({
          points: [
            { x: 134, y: 134 },
            { x: 518, y: 134 },
            { x: 518, y: 326 },
            { x: 134, y: 326 },
          ],
        }),
      ];
    case "vector-rounded-rectangle":
      return [
        makeVector({
          points: rectangleVectorPoints(134, 134, 384, 192),
          cornerRadii: [28, 28, 28, 28],
        }),
      ];
    case "vector-capsule":
      return [
        makeVector({
          points: rectangleVectorPoints(134, 158, 440, 180),
          cornerRadii: [90, 90, 90, 90],
        }),
      ];
    case "vector-circle":
      return [
        makeVector({
          shape: "ellipse",
          points: ellipseVectorPoints(134, 134, 220, 220),
        }),
      ];
    case "vector-ellipse":
      return [
        makeVector({
          shape: "ellipse",
          points: ellipseVectorPoints(134, 134, 346, 198),
        }),
      ];
    case "vector-triangle":
      return [
        makeVector({
          points: [
            { x: 326, y: 122 },
            { x: 518, y: 354 },
            { x: 134, y: 354 },
          ],
        }),
      ];
    case "vector-right-triangle":
      return [
        makeVector({
          points: [
            { x: 134, y: 122 },
            { x: 518, y: 354 },
            { x: 134, y: 354 },
          ],
        }),
      ];
    case "vector-diamond":
      return [
        makeVector({
          points: [
            { x: 326, y: 122 },
            { x: 518, y: 238 },
            { x: 326, y: 354 },
            { x: 134, y: 238 },
          ],
        }),
      ];
    case "vector-parallelogram":
      return [
        makeVector({
          points: [
            { x: 210, y: 134 },
            { x: 574, y: 134 },
            { x: 498, y: 326 },
            { x: 134, y: 326 },
          ],
        }),
      ];
    case "vector-trapezoid":
      return [
        makeVector({
          points: [
            { x: 226, y: 134 },
            { x: 482, y: 134 },
            { x: 574, y: 326 },
            { x: 134, y: 326 },
          ],
        }),
      ];
    case "vector-pentagon":
      return [
        makeVector({
          points: regularPolygonVectorPoints(326, 248, 150, 5, -Math.PI / 2),
        }),
      ];
    case "vector-hexagon":
      return [
        makeVector({
          points: regularPolygonVectorPoints(326, 248, 166, 6),
        }),
      ];
    case "vector-octagon":
      return [
        makeVector({
          points: regularPolygonVectorPoints(
            326,
            248,
            160,
            8,
            Math.PI / 8,
          ),
        }),
      ];
    case "vector-teardrop":
      return [
        makeVector({
          points: [
            { x: 326, y: 112 },
            { x: 442, y: 240 },
            { x: 426, y: 330 },
            { x: 326, y: 386 },
            { x: 226, y: 330 },
            { x: 210, y: 240 },
          ],
          curve: { type: "smooth", tension: 0.32, segments: 16 },
        }),
      ];
    case "vector-arrow":
      return [
        makeVector({
          points: rightArrowVectorPoints(),
        }),
      ];
    case "vector-arrow-left":
      return [
        makeVector({
          points: mirrorVectorPoints(rightArrowVectorPoints(), 354),
        }),
      ];
    case "vector-arrow-up":
      return [
        makeVector({
          points: rotateVectorPoints(rightArrowVectorPoints(), 354, 248, -90),
        }),
      ];
    case "vector-arrow-down":
      return [
        makeVector({
          points: rotateVectorPoints(rightArrowVectorPoints(), 354, 248, 90),
        }),
      ];
    case "vector-arrow-left-right":
      return [
        makeVector({
          points: [
            { x: 126, y: 248 },
            { x: 224, y: 158 },
            { x: 224, y: 206 },
            { x: 484, y: 206 },
            { x: 484, y: 158 },
            { x: 582, y: 248 },
            { x: 484, y: 338 },
            { x: 484, y: 290 },
            { x: 224, y: 290 },
            { x: 224, y: 338 },
          ],
        }),
      ];
    case "vector-arrow-up-down":
      return [
        makeVector({
          points: rotateVectorPoints(
            [
              { x: 126, y: 248 },
              { x: 224, y: 158 },
              { x: 224, y: 206 },
              { x: 484, y: 206 },
              { x: 484, y: 158 },
              { x: 582, y: 248 },
              { x: 484, y: 338 },
              { x: 484, y: 290 },
              { x: 224, y: 290 },
              { x: 224, y: 338 },
            ],
            354,
            248,
            90,
          ),
        }),
      ];
    case "vector-chevron-right":
      return [
        makeVector({
          points: [
            { x: 174, y: 142 },
            { x: 320, y: 142 },
            { x: 520, y: 248 },
            { x: 320, y: 354 },
            { x: 174, y: 354 },
            { x: 374, y: 248 },
          ],
        }),
      ];
    case "vector-notched-arrow":
      return [
        makeVector({
          points: [
            { x: 134, y: 158 },
            { x: 422, y: 158 },
            { x: 422, y: 118 },
            { x: 574, y: 248 },
            { x: 422, y: 378 },
            { x: 422, y: 338 },
            { x: 134, y: 338 },
            { x: 214, y: 248 },
          ],
        }),
      ];
    case "vector-bent-arrow":
      return [
        makeVector({
          points: [
            { x: 134, y: 382 },
            { x: 134, y: 220 },
            { x: 402, y: 220 },
            { x: 402, y: 158 },
            { x: 574, y: 278 },
            { x: 402, y: 398 },
            { x: 402, y: 336 },
            { x: 218, y: 336 },
            { x: 218, y: 382 },
          ],
          cornerRadii: [14, 14, 14, 0, 0, 0, 14, 14, 14],
        }),
      ];
    case "vector-four-way-arrow":
      return [
        makeVector({
          points: [
            { x: 326, y: 104 },
            { x: 402, y: 178 },
            { x: 366, y: 178 },
            { x: 366, y: 208 },
            { x: 396, y: 208 },
            { x: 396, y: 172 },
            { x: 472, y: 248 },
            { x: 396, y: 324 },
            { x: 396, y: 288 },
            { x: 366, y: 288 },
            { x: 366, y: 318 },
            { x: 402, y: 318 },
            { x: 326, y: 392 },
            { x: 250, y: 318 },
            { x: 286, y: 318 },
            { x: 286, y: 288 },
            { x: 256, y: 288 },
            { x: 256, y: 324 },
            { x: 180, y: 248 },
            { x: 256, y: 172 },
            { x: 256, y: 208 },
            { x: 286, y: 208 },
            { x: 286, y: 178 },
            { x: 250, y: 178 },
          ],
        }),
      ];
    case "vector-plus":
      return [
        makeVector({
          points: plusVectorPoints(326, 248, 250, 250, 88),
          cornerRadii: Array(12).fill(8),
        }),
      ];
    case "vector-cross":
      return [
        makeVector({
          points: rotateVectorPoints(
            plusVectorPoints(326, 248, 250, 250, 76),
            326,
            248,
            45,
          ),
          cornerRadii: Array(12).fill(6),
        }),
      ];
    case "vector-lightning":
      return [
        makeVector({
          points: [
            { x: 354, y: 104 },
            { x: 216, y: 270 },
            { x: 314, y: 270 },
            { x: 278, y: 400 },
            { x: 454, y: 210 },
            { x: 350, y: 210 },
          ],
        }),
      ];
    case "vector-home":
      return [
        makeVector({
          points: [
            { x: 326, y: 112 },
            { x: 536, y: 254 },
            { x: 480, y: 254 },
            { x: 480, y: 382 },
            { x: 364, y: 382 },
            { x: 364, y: 286 },
            { x: 288, y: 286 },
            { x: 288, y: 382 },
            { x: 172, y: 382 },
            { x: 172, y: 254 },
            { x: 116, y: 254 },
          ],
          cornerRadii: [6, 6, 0, 10, 8, 8, 8, 8, 10, 0, 6],
        }),
      ];
    case "vector-speech-bubble":
      return [
        makeVector({
          points: [
            { x: 142, y: 130 },
            { x: 534, y: 130 },
            { x: 534, y: 318 },
            { x: 326, y: 318 },
            { x: 226, y: 394 },
            { x: 246, y: 318 },
            { x: 142, y: 318 },
          ],
          cornerRadii: [22, 22, 22, 5, 0, 0, 22],
        }),
      ];
    case "vector-cloud":
      return [
        makeVector({
          points: [
            { x: 182, y: 334 },
            { x: 132, y: 286 },
            { x: 158, y: 222 },
            { x: 232, y: 204 },
            { x: 270, y: 142 },
            { x: 360, y: 134 },
            { x: 414, y: 190 },
            { x: 486, y: 190 },
            { x: 532, y: 246 },
            { x: 514, y: 310 },
            { x: 450, y: 338 },
          ],
          curve: { type: "smooth", tension: 0.42, segments: 16 },
        }),
      ];
    case "vector-heart":
      return [
        makeVector({
          points: [
            { x: 326, y: 190 },
            { x: 270, y: 126 },
            { x: 190, y: 126 },
            { x: 142, y: 194 },
            { x: 154, y: 266 },
            { x: 220, y: 330 },
            { x: 326, y: 394 },
            { x: 432, y: 330 },
            { x: 498, y: 266 },
            { x: 510, y: 194 },
            { x: 462, y: 126 },
            { x: 382, y: 126 },
          ],
          curve: { type: "smooth", tension: 0.38, segments: 16 },
        }),
      ];
    case "vector-star":
      return [
        makeVector({
          points: regularStarVectorPoints(326, 248, 158, 72, 5),
          cornerRadii: Array(10).fill(3),
        }),
      ];
    case "vector-bookmark":
      return [
        makeVector({
          points: [
            { x: 230, y: 112 },
            { x: 422, y: 112 },
            { x: 422, y: 394 },
            { x: 326, y: 330 },
            { x: 230, y: 394 },
          ],
          cornerRadii: [12, 12, 4, 0, 4],
        }),
      ];
    case "vector-shield":
      return [
        makeVector({
          points: [
            { x: 170, y: 132 },
            { x: 482, y: 132 },
            { x: 468, y: 284 },
            { x: 410, y: 346 },
            { x: 326, y: 398 },
            { x: 242, y: 346 },
            { x: 184, y: 284 },
          ],
          cornerRadii: [18, 18, 18, 18, 12, 18, 18],
        }),
      ];
    case "vector-flag":
      return [
        makeVector({
          points: [
            { x: 154, y: 126 },
            { x: 510, y: 126 },
            { x: 450, y: 238 },
            { x: 510, y: 350 },
            { x: 154, y: 350 },
          ],
          cornerRadii: [8, 8, 4, 8, 8],
        }),
      ];
    case "vector-moon":
      return [
        makeVector({
          points: [
            { x: 382, y: 112 },
            { x: 268, y: 126 },
            { x: 188, y: 204 },
            { x: 180, y: 292 },
            { x: 250, y: 374 },
            { x: 366, y: 390 },
            { x: 302, y: 330 },
            { x: 278, y: 250 },
            { x: 310, y: 170 },
          ],
          curve: { type: "smooth", tension: 0.34, segments: 16 },
        }),
      ];
    case "vector-sun":
      return [
        makeVector({
          points: regularStarVectorPoints(326, 248, 164, 104, 16),
          cornerRadii: Array(32).fill(3),
        }),
      ];
    case "vector-play":
      return [
        makeVector({
          points: [
            { x: 226, y: 118 },
            { x: 526, y: 248 },
            { x: 226, y: 378 },
          ],
          cornerRadii: [14, 14, 14],
        }),
      ];
    case "vector-line":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
        }),
      ];
    case "vector-line-arrow":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          endMarker: "arrow",
        }),
      ];
    case "vector-line-arrow-both":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          startMarker: "arrow",
          endMarker: "arrow",
        }),
      ];
    case "vector-line-stealth":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          endMarker: "stealth",
        }),
      ];
    case "vector-line-filled":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          endMarker: "triangle",
        }),
      ];
    case "vector-line-filled-both":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          startMarker: "triangle",
          endMarker: "triangle",
        }),
      ];
    case "vector-line-circle-arrow":
    case "vector-line-square-arrow":
    case "vector-line-diamond-arrow":
      return [
        makeVector({
          points: horizontalLineVectorPoints(),
          closed: false,
          fill: null,
          stroke: DEFAULT_VECTOR_LINE_STROKE,
          startMarker:
            kind === "vector-line-circle-arrow"
              ? "circle"
              : kind === "vector-line-square-arrow"
                ? "square"
                : "diamond",
          endMarker: "triangle",
        }),
      ];
    default:
      return [];
  }
}

function ellipseVectorPoints(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radiusX = width / 2;
  const radiusY = height / 2;
  const centerX = x + radiusX;
  const centerY = y + radiusY;
  return [
    { x: centerX, y },
    { x: x + width, y: centerY },
    { x: centerX, y: y + height },
    { x, y: centerY },
  ];
}

function rectangleVectorPoints(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function rightArrowVectorPoints() {
  return [
    { x: 134, y: 206 },
    { x: 420, y: 206 },
    { x: 420, y: 158 },
    { x: 574, y: 248 },
    { x: 420, y: 338 },
    { x: 420, y: 290 },
    { x: 134, y: 290 },
  ];
}

function horizontalLineVectorPoints() {
  return [
    { x: 204, y: 248 },
    { x: 504, y: 248 },
  ];
}

function mirrorVectorPoints(
  points: Array<{ x: number; y: number }>,
  axisX: number,
) {
  return points.map((point) => ({ x: axisX * 2 - point.x, y: point.y }));
}

function rotateVectorPoints(
  points: Array<{ x: number; y: number }>,
  centerX: number,
  centerY: number,
  degrees: number,
) {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return points.map((point) => {
    const offsetX = point.x - centerX;
    const offsetY = point.y - centerY;
    return {
      x: centerX + offsetX * cosine - offsetY * sine,
      y: centerY + offsetX * sine + offsetY * cosine,
    };
  });
}

function plusVectorPoints(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  armWidth: number,
) {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;
  const armLeft = centerX - armWidth / 2;
  const armRight = centerX + armWidth / 2;
  const armTop = centerY - armWidth / 2;
  const armBottom = centerY + armWidth / 2;
  return [
    { x: armLeft, y: top },
    { x: armRight, y: top },
    { x: armRight, y: armTop },
    { x: right, y: armTop },
    { x: right, y: armBottom },
    { x: armRight, y: armBottom },
    { x: armRight, y: bottom },
    { x: armLeft, y: bottom },
    { x: armLeft, y: armBottom },
    { x: left, y: armBottom },
    { x: left, y: armTop },
    { x: armLeft, y: armTop },
  ];
}

function regularStarVectorPoints(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  tips: number,
  rotation = -Math.PI / 2,
) {
  return Array.from({ length: tips * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (Math.PI * index) / tips;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function regularPolygonVectorPoints(
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
  rotation = 0,
) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (Math.PI * 2 * index) / sides;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function themeFont(
  font: Font | null | undefined,
  color: string,
  family?: string,
): Font {
  return { ...(font ?? {}), color, ...(family ? { family } : {}) };
}

function themeRuns<T extends { font?: Font | null }>(
  runs: T[],
  color: string,
  family?: string,
) {
  return runs.map((run) => ({
    ...run,
    ...(run.font ? { font: themeFont(run.font, color, family) } : {}),
  }));
}

function applyTemplateThemeToElement(
  element: SlideElement,
  theme: TemplateTheme,
): SlideElement {
  const family = theme.fonts?.textFont?.name;

  switch (element.type) {
    case "text":
      return {
        ...element,
        font: themeFont(element.font, theme.background_text, family),
        runs: themeRuns(element.runs, theme.background_text, family),
      };
    case "text-list":
      return {
        ...element,
        font: themeFont(element.font, theme.background_text, family),
        items: element.items.map((item) =>
          themeRuns(item, theme.background_text, family),
        ),
      };
    case "vector":
      return {
        ...element,
        ...(element.fill
          ? { fill: { ...element.fill, color: theme.primary } }
          : {}),
        ...(element.stroke
          ? { stroke: { ...element.stroke, color: theme.stroke } }
          : {}),
      };
    case "image":
      return element.is_icon ? { ...element, color: theme.primary } : element;
    case "container":
      return {
        ...element,
        ...(element.fill
          ? { fill: { ...element.fill, color: theme.card } }
          : {}),
        ...(element.stroke
          ? { stroke: { ...element.stroke, color: theme.stroke } }
          : {}),
        child: element.child
          ? applyTemplateThemeToElement(element.child, theme)
          : element.child,
      };
    case "flex":
    case "grid":
    case "group":
      return {
        ...element,
        children: element.children.map((child) =>
          applyTemplateThemeToElement(child, theme),
        ),
      };
    default:
      return element;
  }
}

function themeElements(elements: SlideElement[], theme: TemplateTheme) {
  return elements.map((element) => applyTemplateThemeToElement(element, theme));
}

export function createTextInsertElements(
  kind?: string,
  theme: TemplateTheme = DEFAULT_TEMPLATE_THEME,
): SlideElement[] {
  return themeElements(createDefaultTextInsertElements(kind), theme);
}

export function createImageInsertContent(
  kind?: string,
  theme: TemplateTheme = DEFAULT_TEMPLATE_THEME,
): EditorInsertContent {
  const content = createDefaultImageInsertContent(kind);
  return {
    ...content,
    elements: content.elements
      ? themeElements(content.elements, theme)
      : content.elements,
    components: content.components?.map((component) => ({
      ...component,
      elements: themeElements(component.elements, theme),
    })),
  };
}

export function createElementInsertElements(
  kind?: string,
  theme: TemplateTheme = DEFAULT_TEMPLATE_THEME,
): SlideElement[] {
  return themeElements(createDefaultElementInsertElements(kind), theme);
}
