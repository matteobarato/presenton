import pytest

from constants.tts_languages import (
    SUPPORTED_TTS_LANGUAGES,
    UnsupportedTTSLanguageError,
    find_tts_language,
    resolve_tts_language,
)


def test_italian_is_supported():
    assert resolve_tts_language("Italian").code == "it"
    assert resolve_tts_language("it").name == "Italian"
    assert resolve_tts_language("italiano").code == "it"
    assert resolve_tts_language("it-IT").code == "it"


def test_language_codes_are_unique():
    codes = [language.code for language in SUPPORTED_TTS_LANGUAGES]
    assert len(codes) == len(set(codes))


@pytest.mark.parametrize(
    "value,expected",
    [
        ("English", "en"),
        ("english", "en"),
        ("EN", "en"),
        ("en-GB", "en"),
        ("  Spanish  ", "es"),
        ("pt-BR", "pt"),
        ("Deutsch", "de"),
        ("zh-Hans", "zh"),
        ("Mandarin Chinese", "zh"),
    ],
)
def test_resolves_names_codes_and_locale_tags(value, expected):
    assert resolve_tts_language(value).code == expected


@pytest.mark.parametrize("value", ["", None, "Klingon", "xx", "  "])
def test_unsupported_languages_are_rejected(value):
    assert find_tts_language(value) is None
    with pytest.raises(UnsupportedTTSLanguageError):
        resolve_tts_language(value)


def test_unsupported_error_lists_the_supported_languages():
    with pytest.raises(UnsupportedTTSLanguageError) as error:
        resolve_tts_language("Klingon")
    message = str(error.value)
    assert "Klingon" in message
    assert "Italian (it)" in message
