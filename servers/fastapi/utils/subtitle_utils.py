"""Turn narration text into WebVTT subtitle cues.

Speaker-note audio is one file per slide, but a slide's narration can run to
several sentences, so a single subtitle cue spanning the whole slide would sit
on screen far longer than a viewer can usefully read. This module splits a
slide's spoken text into cues sized for reading, and gives each cue a
proportional slice of the slide's audio window - proportional to character
count rather than word count or sentence count, since that is the cheapest
signal that roughly tracks how long a cue takes to both speak and read.

Pure and dependency-free by design: it is exercised directly in tests without
touching ffmpeg, the database, or the filesystem beyond writing the final
`.vtt` file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

# WebVTT has no hard line-length limit, but a cue this long starts running off
# a typical video player's subtitle safe area, so sentences longer than this
# are hard-wrapped on a word boundary.
DEFAULT_MAX_CHARS = 84

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?…。！？])\s+")
_ESCAPES = (
    ("&", "&amp;"),
    ("-->", "--&gt;"),
    ("<", "&lt;"),
    (">", "&gt;"),
)


@dataclass
class Cue:
    start_seconds: float
    end_seconds: float
    text: str


def escape_cue_text(text: str) -> str:
    """Escape characters WebVTT treats specially, including the arrow token."""
    escaped = text
    for needle, replacement in _ESCAPES:
        escaped = escaped.replace(needle, replacement)
    return escaped


def format_timestamp(seconds: float) -> str:
    """Render seconds as WebVTT's HH:MM:SS.mmm timestamp."""
    total_ms = max(0, round(seconds * 1000))
    hours, remainder_ms = divmod(total_ms, 3_600_000)
    minutes, remainder_ms = divmod(remainder_ms, 60_000)
    secs, millis = divmod(remainder_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def _split_sentences(text: str) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []
    return [s for s in _SENTENCE_BOUNDARY.split(normalized) if s]


def _wrap_long_chunk(chunk: str, max_chars: int) -> list[str]:
    if len(chunk) <= max_chars:
        return [chunk]
    words = chunk.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    # A single word longer than max_chars on its own is left intact rather
    # than sliced mid-word, since a mid-word break is harder to read than an
    # over-length line.
    return lines


def _chunk_text(text: str, max_chars: int) -> list[str]:
    chunks: list[str] = []
    for sentence in _split_sentences(text):
        chunks.extend(_wrap_long_chunk(sentence, max_chars))
    return chunks


def split_into_cues(
    text: str,
    *,
    start_seconds: float,
    duration_seconds: float,
    max_chars: int = DEFAULT_MAX_CHARS,
) -> list[Cue]:
    """Split narration text into cues spanning `[start, start+duration]`.

    Each cue's share of the window is proportional to its character count.
    Cues are strictly monotonic and non-overlapping (one cue's end is the
    next one's start), and the final cue always ends exactly at
    `start_seconds + duration_seconds` - rounding error is absorbed there
    rather than left to drift across cues.
    """
    if not text or not text.strip() or duration_seconds <= 0:
        return []

    chunks = _chunk_text(text, max_chars)
    if not chunks:
        return []

    total_chars = sum(len(chunk) for chunk in chunks)
    if total_chars <= 0:
        return []

    window_end = start_seconds + duration_seconds
    cues: list[Cue] = []
    cursor = start_seconds
    for position, chunk in enumerate(chunks):
        is_last = position == len(chunks) - 1
        if is_last:
            end = window_end
        else:
            share = len(chunk) / total_chars
            end = cursor + duration_seconds * share
            end = min(end, window_end)
        cues.append(Cue(start_seconds=cursor, end_seconds=end, text=chunk))
        cursor = end

    return cues


def write_webvtt(cues: Sequence[Cue], path: str) -> None:
    """Write cues to `path` as a WebVTT file."""
    lines = ["WEBVTT", ""]
    for index, cue in enumerate(cues, start=1):
        lines.append(str(index))
        lines.append(
            f"{format_timestamp(cue.start_seconds)} --> {format_timestamp(cue.end_seconds)}"
        )
        lines.append(escape_cue_text(cue.text))
        lines.append("")
    content = "\n".join(lines).rstrip("\n") + "\n"
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
