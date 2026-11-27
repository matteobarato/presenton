"""Speaker notes of an uploaded PowerPoint deck, aligned to converted slides."""

import re
from typing import NamedTuple, Sequence

from pptx import Presentation

_SLIDE_ID = re.compile(r"^slide_(\d+)$")


class SlideNote(NamedTuple):
    number: int  # 1-based, in sldIdLst order
    hidden: bool
    text: str


def read_speaker_notes(pptx_path: str) -> list[SlideNote]:
    notes: list[SlideNote] = []
    for number, slide in enumerate(Presentation(pptx_path).slides, start=1):
        text = ""
        if slide.has_notes_slide:
            frame = slide.notes_slide.notes_text_frame
            if frame is not None:
                text = frame.text.strip()
        notes.append(
            SlideNote(number, slide._element.get("show") == "0", text)
        )
    return notes


def align_speaker_notes(
    layout_ids: Sequence[str], notes: Sequence[SlideNote]
) -> list[str]:
    """One note text per converted slide.

    The converter names slides `slide_<n>` after the deck's own numbering, which
    settles the match even when it skipped hidden slides. Otherwise fall back to
    position, then to the visible slides, then to position with padding.
    """
    matches = [_SLIDE_ID.match(layout_id) for layout_id in layout_ids]
    if layout_ids and all(matches):
        numbers = [int(m.group(1)) for m in matches if m]
        if all(1 <= n <= len(notes) for n in numbers):
            by_number = {note.number: note.text for note in notes}
            return [by_number[n] for n in numbers]

    if len(layout_ids) == len(notes):
        return [note.text for note in notes]
    visible = [note for note in notes if not note.hidden]
    if len(layout_ids) == len(visible):
        return [note.text for note in visible]
    return [
        notes[i].text if i < len(notes) else "" for i in range(len(layout_ids))
    ]
