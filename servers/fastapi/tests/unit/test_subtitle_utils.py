import os

import pytest

from utils.subtitle_utils import (
    Cue,
    escape_cue_text,
    format_timestamp,
    split_into_cues,
    write_webvtt,
)


def test_empty_text_produces_no_cues():
    assert split_into_cues("", start_seconds=0.0, duration_seconds=5.0) == []
    assert split_into_cues("   ", start_seconds=0.0, duration_seconds=5.0) == []


def test_zero_duration_produces_no_cues():
    assert split_into_cues("Hello there.", start_seconds=1.0, duration_seconds=0.0) == []


def test_sentence_splitting_produces_one_cue_per_sentence():
    text = "First sentence. Second sentence! Third one?"
    cues = split_into_cues(text, start_seconds=0.0, duration_seconds=9.0)
    assert [cue.text for cue in cues] == [
        "First sentence.",
        "Second sentence!",
        "Third one?",
    ]


def test_cue_timing_is_proportional_to_character_count():
    # "AAAA." (5 chars) and "BBBBBBBBBB." (11 chars) -> 16 total chars over a
    # 16 second window: 5s then 11s.
    text = "AAAA. BBBBBBBBBB."
    cues = split_into_cues(text, start_seconds=0.0, duration_seconds=16.0)
    assert len(cues) == 2
    assert cues[0].start_seconds == pytest.approx(0.0)
    assert cues[0].end_seconds == pytest.approx(5.0, abs=0.01)
    assert cues[1].start_seconds == pytest.approx(5.0, abs=0.01)
    assert cues[1].end_seconds == pytest.approx(16.0, abs=0.01)


def test_cues_are_monotonic_non_overlapping_and_end_exactly_at_window_end():
    text = (
        "This is the first sentence of the narration. Here comes a second "
        "one that is a bit longer than the first. And a short third."
    )
    start = 12.345
    duration = 7.89
    cues = split_into_cues(text, start_seconds=start, duration_seconds=duration)
    assert len(cues) >= 2
    assert cues[0].start_seconds == pytest.approx(start)
    for earlier, later in zip(cues, cues[1:]):
        assert earlier.end_seconds == pytest.approx(later.start_seconds)
        assert later.start_seconds >= earlier.start_seconds
    assert cues[-1].end_seconds == pytest.approx(start + duration)


def test_long_sentence_is_hard_wrapped_at_max_chars():
    text = "word " * 40  # far longer than max_chars, single "sentence"
    cues = split_into_cues(
        text.strip() + ".", start_seconds=0.0, duration_seconds=10.0, max_chars=20
    )
    assert len(cues) > 1
    for cue in cues:
        assert len(cue.text) <= 24  # allow a little slack for the trailing word


def test_a_single_word_longer_than_max_chars_is_not_sliced_mid_word():
    long_word = "supercalifragilisticexpialidocious"
    cues = split_into_cues(
        long_word + ".", start_seconds=0.0, duration_seconds=3.0, max_chars=10
    )
    assert any(long_word in cue.text for cue in cues)


def test_special_characters_are_escaped():
    assert escape_cue_text("A & B") == "A &amp; B"
    assert escape_cue_text("5 --> 10") == "5 --&gt; 10"
    assert escape_cue_text("<b>bold</b>") == "&lt;b&gt;bold&lt;/b&gt;"


@pytest.mark.parametrize(
    "seconds,expected",
    [
        (0, "00:00:00.000"),
        (0.5, "00:00:00.500"),
        (61.25, "00:01:01.250"),
        (3661.001, "01:01:01.001"),
        (3600 * 2 + 61.999, "02:01:01.999"),
    ],
)
def test_format_timestamp_edge_cases(seconds, expected):
    assert format_timestamp(seconds) == expected


def test_write_webvtt_writes_header_and_cues(tmp_path):
    cues = [
        Cue(start_seconds=0.0, end_seconds=1.5, text="Hello -->"),
        Cue(start_seconds=1.5, end_seconds=3.0, text="World & friends"),
    ]
    path = str(tmp_path / "out.vtt")
    write_webvtt(cues, path)
    assert os.path.isfile(path)
    content = open(path, encoding="utf-8").read()
    assert content.startswith("WEBVTT\n")
    assert "00:00:00.000 --> 00:00:01.500" in content
    assert "Hello --&gt;" in content
    assert "World &amp; friends" in content


def test_write_webvtt_with_no_cues_still_writes_header(tmp_path):
    path = str(tmp_path / "empty.vtt")
    write_webvtt([], path)
    content = open(path, encoding="utf-8").read()
    assert content.strip() == "WEBVTT"
