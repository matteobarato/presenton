from typing import List

from pydantic import BaseModel, Field, field_validator


class SpeakerNoteUpdate(BaseModel):
    """A hand-written note for one slide; an empty note clears it."""

    slide_index: int
    speaker_note: str


class SpeakerNotesUpdateRequest(BaseModel):
    """Speaker notes written by hand, one entry per slide to change."""

    notes: List[SpeakerNoteUpdate] = Field(min_length=1)

    @field_validator("notes")
    @classmethod
    def _one_note_per_slide(
        cls, notes: List[SpeakerNoteUpdate]
    ) -> List[SpeakerNoteUpdate]:
        indexes = [note.slide_index for note in notes]
        duplicates = sorted({index for index in indexes if indexes.count(index) > 1})
        if duplicates:
            raise ValueError(
                "Each slide can only be given one note, but these slide indexes "
                "appear more than once: "
                + ", ".join(str(index) for index in duplicates)
            )
        return notes
