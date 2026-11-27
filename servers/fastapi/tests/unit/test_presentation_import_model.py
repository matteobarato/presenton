import uuid

from models.presentation_with_slides import PresentationWithSlides
from models.sql.presentation import PresentationModel, PresentationVersion


def test_duplicate_keeps_import_source():
    p = PresentationModel(id=uuid.uuid4(), version=PresentationVersion.V2_STANDARD, content="", n_slides=1,
                          language="English", source="pptx", source_name="Deck.pptx")
    copy = p.get_new_presentation()
    assert (copy.source, copy.source_name) == ("pptx", "Deck.pptx")


def test_presentation_response_exposes_source():
    fields = PresentationWithSlides.model_fields
    assert "source" in fields and "source_name" in fields
