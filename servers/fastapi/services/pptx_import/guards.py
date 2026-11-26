from fastapi import HTTPException

from constants.presentation import (
    IMPORTED_DECK_REBUILD_MESSAGE,
    PRESENTATION_SOURCE_PPTX,
)
from models.sql.presentation import PresentationModel


def ensure_not_imported(presentation: PresentationModel) -> None:
    """Refuse template rebuilds of a deck imported from PowerPoint."""
    if presentation.source == PRESENTATION_SOURCE_PPTX:
        raise HTTPException(status_code=409, detail=IMPORTED_DECK_REBUILD_MESSAGE)
