import pytest
from pptx import Presentation

from services.pptx_import.notes import SlideNote, align_speaker_notes, read_speaker_notes


@pytest.fixture
def deck(tmp_path):
    prs = Presentation()
    for _ in range(4):
        prs.slides.add_slide(prs.slide_layouts[6])
    prs.slides[0].notes_slide.notes_text_frame.text = "  first note \n"
    prs.slides[2].notes_slide.notes_text_frame.text = "third note"
    prs.slides[1]._element.set("show", "0")
    path = tmp_path / "deck.pptx"
    prs.save(str(path))
    return str(path)


def _notes(n1="n1", n3="n3"):
    return [
        SlideNote(1, False, n1),
        SlideNote(2, True, ""),
        SlideNote(3, False, n3),
    ]


def test_read_speaker_notes(deck):
    notes = read_speaker_notes(deck)
    assert [n.number for n in notes] == [1, 2, 3, 4]
    assert [n.hidden for n in notes] == [False, True, False, False]
    assert [n.text for n in notes] == ["first note", "", "third note", ""]


def test_slide_numbers_in_layout_ids_decide():
    assert align_speaker_notes(["slide_1", "slide_3"], _notes()) == ["n1", "n3"]


def test_same_count_aligns_by_index():
    assert align_speaker_notes(["a", "b", "c"], _notes()) == ["n1", "", "n3"]


def test_visible_count_aligns_to_visible_slides():
    assert align_speaker_notes(["a", "b"], _notes()) == ["n1", "n3"]


def test_other_counts_pad_with_empty_text():
    assert align_speaker_notes(["a"] * 5, _notes()) == ["n1", "", "n3", "", ""]


def test_out_of_range_slide_number_falls_back_to_index():
    assert align_speaker_notes(["slide_1", "slide_9"], _notes()) == ["n1", "n3"]
