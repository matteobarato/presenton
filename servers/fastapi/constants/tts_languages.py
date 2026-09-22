"""Languages speaker-note audio can be synthesized in.

Text-to-speech providers do not take a language parameter: a voice reads
whatever text it is given, in whatever language that text happens to be. So the
language a caller asks for is enforced on the *text* side instead, by
translating a note before it is synthesized, and the set below is the list of
languages that translation-then-synthesis is supported for.

Presentations store their language as free text ("English", "it-IT", "Italiano"),
so resolution accepts display names, ISO codes and locale tags alike and
normalizes them to one canonical code.
"""

from __future__ import annotations

from typing import NamedTuple, Optional


class TTSLanguage(NamedTuple):
    code: str
    name: str


SUPPORTED_TTS_LANGUAGES: tuple[TTSLanguage, ...] = (
    TTSLanguage("it", "Italian"),
    TTSLanguage("en", "English"),
    TTSLanguage("es", "Spanish"),
    TTSLanguage("fr", "French"),
    TTSLanguage("de", "German"),
    TTSLanguage("pt", "Portuguese"),
    TTSLanguage("nl", "Dutch"),
    TTSLanguage("pl", "Polish"),
    TTSLanguage("ro", "Romanian"),
    TTSLanguage("cs", "Czech"),
    TTSLanguage("el", "Greek"),
    TTSLanguage("sv", "Swedish"),
    TTSLanguage("da", "Danish"),
    TTSLanguage("no", "Norwegian"),
    TTSLanguage("fi", "Finnish"),
    TTSLanguage("uk", "Ukrainian"),
    TTSLanguage("ru", "Russian"),
    TTSLanguage("tr", "Turkish"),
    TTSLanguage("ar", "Arabic"),
    TTSLanguage("he", "Hebrew"),
    TTSLanguage("hi", "Hindi"),
    TTSLanguage("id", "Indonesian"),
    TTSLanguage("vi", "Vietnamese"),
    TTSLanguage("th", "Thai"),
    TTSLanguage("ja", "Japanese"),
    TTSLanguage("ko", "Korean"),
    TTSLanguage("zh", "Chinese"),
)

_BY_CODE = {language.code: language for language in SUPPORTED_TTS_LANGUAGES}

# Endonyms and the spellings the presentation language field is written with in
# practice. Keys are compared lowercased with separators stripped.
_ALIASES: dict[str, str] = {
    "italiano": "it",
    "italien": "it",
    "ita": "it",
    "inglese": "en",
    "english": "en",
    "eng": "en",
    "espanol": "es",
    "espanyol": "es",
    "spagnolo": "es",
    "castellano": "es",
    "spa": "es",
    "francais": "fr",
    "francese": "fr",
    "fra": "fr",
    "fre": "fr",
    "deutsch": "de",
    "tedesco": "de",
    "ger": "de",
    "deu": "de",
    "portugues": "pt",
    "portoghese": "pt",
    "brazilian portuguese": "pt",
    "por": "pt",
    "nederlands": "nl",
    "olandese": "nl",
    "dut": "nl",
    "nld": "nl",
    "polski": "pl",
    "polacco": "pl",
    "pol": "pl",
    "romana": "ro",
    "rumeno": "ro",
    "ron": "ro",
    "rum": "ro",
    "cestina": "cs",
    "ceco": "cs",
    "cze": "cs",
    "ces": "cs",
    "ellinika": "el",
    "greco": "el",
    "gre": "el",
    "ell": "el",
    "svenska": "sv",
    "svedese": "sv",
    "swe": "sv",
    "dansk": "da",
    "danese": "da",
    "dan": "da",
    "norsk": "no",
    "norvegese": "no",
    "bokmal": "no",
    "nob": "no",
    "nor": "no",
    "suomi": "fi",
    "finlandese": "fi",
    "fin": "fi",
    "ukrainska": "uk",
    "ucraino": "uk",
    "ukr": "uk",
    "russkiy": "ru",
    "russo": "ru",
    "rus": "ru",
    "turkce": "tr",
    "turco": "tr",
    "tur": "tr",
    "arabo": "ar",
    "ara": "ar",
    "ivrit": "he",
    "ebraico": "he",
    "heb": "he",
    "iw": "he",
    "hindi": "hi",
    "indiano": "hi",
    "hin": "hi",
    "bahasa": "id",
    "bahasa indonesia": "id",
    "indonesiano": "id",
    "ind": "id",
    "in": "id",
    "tiengviet": "vi",
    "vietnamita": "vi",
    "vie": "vi",
    "thailandese": "th",
    "tha": "th",
    "nihongo": "ja",
    "giapponese": "ja",
    "jpn": "ja",
    "jp": "ja",
    "hangugeo": "ko",
    "coreano": "ko",
    "kor": "ko",
    "mandarin": "zh",
    "mandarin chinese": "zh",
    "cinese": "zh",
    "zhongwen": "zh",
    "chi": "zh",
    "zho": "zh",
    "cmn": "zh",
}


class UnsupportedTTSLanguageError(ValueError):
    """Raised for a language speaker-note audio cannot be produced in."""

    def __init__(self, value: str):
        self.value = value
        super().__init__(
            f"'{value}' is not a supported speaker note audio language. "
            f"Supported languages: {supported_tts_languages_hint()}"
        )


def supported_tts_languages_hint() -> str:
    return ", ".join(
        f"{language.name} ({language.code})" for language in SUPPORTED_TTS_LANGUAGES
    )


def _normalize(value: str) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", "-").split())


def find_tts_language(value: Optional[str]) -> Optional[TTSLanguage]:
    """Resolve a display name, ISO code or locale tag, or None if unsupported."""
    normalized = _normalize(value or "")
    if not normalized:
        return None

    # "it-IT", "en-GB", "pt-BR" all carry their language in the first subtag.
    candidates = [normalized]
    if "-" in normalized:
        candidates.append(normalized.split("-", 1)[0])
    candidates.append(normalized.replace("-", " "))
    candidates.append(normalized.replace("-", ""))

    for candidate in candidates:
        if candidate in _BY_CODE:
            return _BY_CODE[candidate]
        if candidate in _ALIASES:
            return _BY_CODE[_ALIASES[candidate]]
        for language in SUPPORTED_TTS_LANGUAGES:
            if candidate == language.name.lower():
                return language
    return None


def resolve_tts_language(value: Optional[str]) -> TTSLanguage:
    """Resolve a requested language, raising for anything unsupported."""
    language = find_tts_language(value)
    if language is None:
        raise UnsupportedTTSLanguageError(str(value or ""))
    return language
