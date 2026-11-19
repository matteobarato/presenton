import asyncio
import hashlib
import json
import os
import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import services.slide_animation_service as sas
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
# Imported so the owner_id foreign keys can resolve their column type.
from models.sql.user import User  # noqa: F401
from services.slide_animation_service import (
    AnimationValidationError,
    plan_status,
    resolve_slide_animations,
    set_user_animation,
    targets_signature,
)
from utils.llm_calls.generate_slide_animations import (
    SLIDE_ANIMATION_MAX_SECONDS,
    SlideTween,
    fallback_slide_animation,
)


def _hash(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8")).hexdigest()


def _elements(*ids: str, kind: str = "text"):
    return [
        {"id": eid, "kind": kind, "box": {"x": 10.0 * n, "y": 20.0 * n, "width": 100.0, "height": 40.0}, "text": f"t{eid}"}
        for n, eid in enumerate(ids)
    ]


def _entry(slide_id, index, html, elements):
    return {"id": str(slide_id), "index": index, "html": html, "elements": elements}


def _plan(source, html, elements, *, tweens=None, reset_from_user=False):
    return {
        "version": 1,
        "source": source,
        "html_hash": _hash(html),
        "targets_signature": targets_signature(elements),
        "tweens": tweens
        if tweens is not None
        else [
            {"target": elements[0]["id"], "from_values": {"opacity": 0.0, "x": -40.0}, "duration": 0.8, "delay": 0.2, "ease": "expo.out"}
        ],
        "reset_from_user": reset_from_user,
        "updated_at": "2026-11-01T00:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# targets_signature / plan_status
# ---------------------------------------------------------------------------


def test_targets_signature_is_ordered_id_kind_only():
    a = _elements("e0", "e1")
    moved = [dict(e, box={"x": 1, "y": 1, "width": 1, "height": 1}, text="other") for e in a]
    assert targets_signature(a) == targets_signature(moved)
    assert targets_signature(a) != targets_signature(list(reversed(a)))
    assert targets_signature(a) != targets_signature(_elements("e0", "e1", kind="image"))
    expected = hashlib.sha256(json.dumps([["e0", "text"], ["e1", "text"]]).encode("utf-8")).hexdigest()
    assert targets_signature(a) == expected


_OLD_HTML = "<div>old</div>"
_NEW_HTML = "<div>new</div>"
_ELS = _elements("e0", "e1")
_OTHER_ELS = _elements("e0", "e1", "e2")


@pytest.mark.parametrize("source", ["llm", "fallback", "user"])
@pytest.mark.parametrize(
    "entry_html, entry_elements, expected",
    [
        (_OLD_HTML, _ELS, "fresh"),
        (_NEW_HTML, _ELS, "stale_content"),
        (_NEW_HTML, _OTHER_ELS, "stale_layout"),
        ("", _ELS, "unsupported"),
        (None, _ELS, "unsupported"),
    ],
)
def test_plan_status(source, entry_html, entry_elements, expected):
    stored = _plan(source, _OLD_HTML, _ELS)
    entry = _entry(uuid.uuid4(), 0, entry_html, entry_elements)
    assert plan_status(stored, entry) == expected


@pytest.mark.parametrize(
    "entry_html, expected",
    [(_OLD_HTML, "missing"), ("", "unsupported"), (None, "unsupported")],
)
def test_plan_status_without_plan(entry_html, expected):
    entry = _entry(uuid.uuid4(), 0, entry_html, _ELS)
    assert plan_status(None, entry) == expected
    assert plan_status({"garbage": True}, entry) == expected


# ---------------------------------------------------------------------------
# resolve_slide_animations, against a real sqlite DB
# ---------------------------------------------------------------------------


class _Deck:
    def __init__(self, tmp_path, count=4):
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'anim.db'}")
        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)
        self.presentation_id = uuid.uuid4()
        self.slide_ids = [uuid.uuid4() for _ in range(count)]

    async def seed(self, animations=None):
        animations = animations or {}
        async with self.engine.begin() as connection:
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)
        async with self.session_maker() as session:
            session.add(
                PresentationModel(
                    id=self.presentation_id,
                    version=PresentationVersion.V2_STANDARD,
                    content="Annual review",
                    n_slides=len(self.slide_ids),
                    language="English",
                    title="Annual Review",
                )
            )
            for index, slide_id in enumerate(self.slide_ids):
                session.add(
                    SlideModel(
                        id=slide_id,
                        presentation=self.presentation_id,
                        layout_group="general",
                        layout="title",
                        index=index,
                        content={"title": f"Slide {index}"},
                        animation=animations.get(index),
                    )
                )
            await session.commit()

    async def animations(self):
        async with self.session_maker() as session:
            return [
                (await session.get(SlideModel, slide_id)).animation
                for slide_id in self.slide_ids
            ]

    def resolve(self, **kwargs):
        async def scenario():
            async with self.session_maker() as session:
                presentation = await session.get(PresentationModel, self.presentation_id)
                return await resolve_slide_animations(session, presentation, "cookie=1", **kwargs)

        return asyncio.run(scenario())


_LLM_TWEEN = SlideTween(target="e0", from_values={"opacity": 0.0, "y": 30.0}, duration=0.6, delay=0.1, ease="power2.out")


def _patch(monkeypatch, tmp_path, deck, entries, *, fail_for=()):
    state = {"planned": [], "fetches": 0}

    async def fake_fetch(presentation_id, cookie_header):
        assert presentation_id == deck.presentation_id
        assert cookie_header == "cookie=1"
        state["fetches"] += 1
        return {"slides": entries}

    async def fake_plans(*, slides, slide_count, deck_title, **_kwargs):
        assert slide_count == len(deck.slide_ids)
        assert deck_title == "Annual Review"
        result = {}
        for index, elements in slides:
            state["planned"].append(index)
            result[index] = (
                fallback_slide_animation(elements) if index in fail_for else [_LLM_TWEEN]
            )
        return result

    monkeypatch.setattr(sas, "_fetch_video_composition", fake_fetch)
    monkeypatch.setattr(sas, "generate_slide_animations", fake_plans)
    monkeypatch.setattr(sas, "get_videos_directory", lambda: str(tmp_path / "videos"))
    return state


def test_resolve_plans_only_missing_and_stale(tmp_path, monkeypatch):
    deck = _Deck(tmp_path, count=6)
    els = _elements("e0", "e1")
    entries = [
        _entry(deck.slide_ids[0], 0, "<p>0</p>", els),  # missing
        _entry(deck.slide_ids[1], 1, "<p>1</p>", els),  # fresh llm
        _entry(deck.slide_ids[2], 2, "<p>2 new</p>", els),  # stale_content llm
        _entry(deck.slide_ids[3], 3, "<p>3 new</p>", els),  # stale_content user: kept
        _entry(deck.slide_ids[4], 4, "", []),  # unsupported
        _entry(deck.slide_ids[5], 5, "<p>5</p>", _elements("e0")),  # missing, LLM fails
    ]
    user_tweens = [
        {"target": "e1", "from_values": {"scale": 0.8}, "duration": 0.5, "delay": 0.3, "ease": "sine.out"}
    ]
    fresh = _plan("llm", "<p>1</p>", els)
    seeded = {
        1: fresh,
        2: _plan("llm", "<p>2</p>", els),
        3: _plan("user", "<p>3</p>", els, tweens=user_tweens),
    }
    asyncio.run(deck.seed(seeded))
    state = _patch(monkeypatch, tmp_path, deck, entries, fail_for={5})
    progress = []

    plans = deck.resolve(on_progress=progress.append)

    assert sorted(state["planned"]) == [0, 2, 5]
    stored = asyncio.run(deck.animations())
    assert stored[0]["source"] == "llm"
    assert stored[0]["tweens"] == [_LLM_TWEEN.to_dict()]
    assert stored[0]["html_hash"] == _hash("<p>0</p>")
    assert stored[0]["targets_signature"] == targets_signature(els)
    assert stored[0]["version"] == 1 and stored[0]["reset_from_user"] is False
    assert stored[0]["updated_at"]
    assert stored[1] == fresh
    assert stored[2]["source"] == "llm" and stored[2]["html_hash"] == _hash("<p>2 new</p>")
    # Hand-edited plan survives a content-only change: same tweens, new hash.
    assert stored[3]["source"] == "user"
    assert stored[3]["tweens"] == user_tweens
    assert stored[3]["html_hash"] == _hash("<p>3 new</p>")
    assert stored[3]["reset_from_user"] is False
    assert stored[4] is None
    assert stored[5]["source"] == "fallback"

    assert set(plans) == {deck.slide_ids[i] for i in (0, 1, 2, 3, 5)}
    assert plans[deck.slide_ids[3]] == stored[3]
    assert progress[0] == {"stage": "animation-plan", "done": 2, "total": 5}
    assert progress[-1] == {"stage": "animation-plan", "done": 5, "total": 5}

    # Everything is fresh now: a second resolve makes no LLM call.
    state["planned"].clear()
    deck.resolve()
    assert state["planned"] == []


def test_resolve_respects_slide_ids_scope(tmp_path, monkeypatch):
    deck = _Deck(tmp_path, count=3)
    els = _elements("e0")
    entries = [_entry(sid, i, f"<p>{i}</p>", els) for i, sid in enumerate(deck.slide_ids)]
    asyncio.run(deck.seed())
    state = _patch(monkeypatch, tmp_path, deck, entries)

    plans = deck.resolve(slide_ids=[deck.slide_ids[1]])

    assert state["planned"] == [1]
    assert set(plans) == {deck.slide_ids[1]}
    stored = asyncio.run(deck.animations())
    assert stored[0] is None and stored[2] is None


def test_force_replans_user_plans_and_sets_nothing_silently(tmp_path, monkeypatch):
    deck = _Deck(tmp_path, count=3)
    els = _elements("e0", "e1")
    entries = [_entry(sid, i, f"<p>{i}</p>", els) for i, sid in enumerate(deck.slide_ids)]
    user_plan = _plan("user", "<p>0</p>", els)
    fallback_plan = _plan("fallback", "<p>1</p>", els)
    untouched_user = _plan("user", "<p>2</p>", els)
    asyncio.run(deck.seed({0: user_plan, 1: fallback_plan, 2: untouched_user}))
    state = _patch(monkeypatch, tmp_path, deck, entries)

    # Without force, fresh plans of every source are left alone.
    deck.resolve()
    assert state["planned"] == []
    assert asyncio.run(deck.animations()) == [user_plan, fallback_plan, untouched_user]

    deck.resolve(slide_ids=[deck.slide_ids[0], deck.slide_ids[1]], force=True)

    assert sorted(state["planned"]) == [0, 1]
    stored = asyncio.run(deck.animations())
    # The user asked for this, so the replaced plan is not flagged as a reset.
    assert stored[0]["source"] == "llm"
    assert stored[0]["tweens"] == [_LLM_TWEEN.to_dict()]
    assert stored[0]["reset_from_user"] is False
    assert stored[1]["source"] == "llm"
    # Out-of-scope slides are untouched.
    assert stored[2] == untouched_user


def test_layout_change_resets_user_plan_and_flags_it(tmp_path, monkeypatch):
    deck = _Deck(tmp_path, count=2)
    old_els = _elements("e0", "e1")
    new_els = _elements("e0", "e1", "e2")
    entries = [
        _entry(deck.slide_ids[0], 0, "<p>0 new</p>", new_els),
        _entry(deck.slide_ids[1], 1, "<p>1 new</p>", new_els),
    ]
    asyncio.run(
        deck.seed(
            {
                0: _plan("user", "<p>0</p>", old_els),
                1: _plan("llm", "<p>1</p>", old_els),
            }
        )
    )
    state = _patch(monkeypatch, tmp_path, deck, entries)

    deck.resolve()

    assert sorted(state["planned"]) == [0, 1]
    stored = asyncio.run(deck.animations())
    assert stored[0]["source"] == "llm"
    assert stored[0]["reset_from_user"] is True
    assert stored[0]["targets_signature"] == targets_signature(new_els)
    assert stored[1]["reset_from_user"] is False

    # The flag stays until the user saves an edit, even across later re-plans.
    entries[0] = _entry(deck.slide_ids[0], 0, "<p>0 newer</p>", new_els)
    deck.resolve()
    assert asyncio.run(deck.animations())[0]["reset_from_user"] is True


def test_legacy_file_adopted_only_on_hash_match(tmp_path, monkeypatch):
    deck = _Deck(tmp_path, count=3)
    els = _elements("e0", "e1")
    entries = [_entry(sid, i, f"<p>{i}</p>", els) for i, sid in enumerate(deck.slide_ids)]
    legacy_tween = {"target": "e1", "from_values": {"x": -50.0}, "duration": 0.7, "delay": 0.0, "ease": "circ.out"}
    legacy = {
        str(deck.slide_ids[0]): {"html_hash": _hash("<p>0</p>"), "tweens": [legacy_tween]},
        str(deck.slide_ids[1]): {"html_hash": _hash("<p>1 old</p>"), "tweens": [legacy_tween]},
        str(deck.slide_ids[2]): {"html_hash": _hash("<p>2</p>"), "tweens": [legacy_tween]},
    }
    db_plan = _plan("user", "<p>2</p>", els)
    asyncio.run(deck.seed({2: db_plan}))
    state = _patch(monkeypatch, tmp_path, deck, entries)
    legacy_path = tmp_path / "videos" / str(deck.presentation_id) / "animation-plans.json"
    os.makedirs(legacy_path.parent)
    legacy_path.write_text(json.dumps(legacy))
    before = legacy_path.read_text()

    deck.resolve()

    # Slide 0 adopted (hash match); slide 1 re-planned; slide 2 keeps its DB plan.
    assert state["planned"] == [1]
    stored = asyncio.run(deck.animations())
    assert stored[0]["source"] == "llm"
    assert stored[0]["tweens"] == [legacy_tween]
    assert stored[0]["html_hash"] == _hash("<p>0</p>")
    assert stored[0]["targets_signature"] == targets_signature(els)
    assert stored[1]["tweens"] == [_LLM_TWEEN.to_dict()]
    assert stored[2] == db_plan
    # The legacy file is read-only.
    assert legacy_path.read_text() == before


# ---------------------------------------------------------------------------
# set_user_animation
# ---------------------------------------------------------------------------


def _slide():
    return SlideModel(
        id=uuid.uuid4(),
        presentation=uuid.uuid4(),
        layout_group="general",
        layout="title",
        index=0,
        content={},
    )


def test_set_user_animation_clamps_to_window():
    slide = _slide()
    els = _elements("e0", "e1")
    entry = _entry(slide.id, 0, "<p>x</p>", els)

    plan = set_user_animation(
        slide,
        entry,
        [
            {"target": "e0", "from_values": {"opacity": 0, "x": -900}, "duration": 1.2, "delay": 2.4, "ease": "nope"},
            {"target": "e9", "from_values": {"opacity": 0}, "duration": 0.5, "delay": 0, "ease": "sine.out"},
        ],
    )

    assert slide.animation == plan
    assert plan["source"] == "user"
    assert plan["reset_from_user"] is False
    assert plan["version"] == 1
    assert plan["html_hash"] == _hash("<p>x</p>")
    assert plan["targets_signature"] == targets_signature(els)
    assert len(plan["tweens"]) == 1
    tween = SlideTween.from_dict(plan["tweens"][0])
    assert tween.end_seconds <= SLIDE_ANIMATION_MAX_SECONDS + 1e-9
    assert tween.from_values == {"opacity": 0.0, "x": -400.0}
    assert tween.ease == "power2.out"


def test_set_user_animation_rejects_all_unknown_targets():
    slide = _slide()
    entry = _entry(slide.id, 0, "<p>x</p>", _elements("e0"))
    with pytest.raises(AnimationValidationError):
        set_user_animation(
            slide,
            entry,
            [{"target": "e7", "from_values": {"opacity": 0}, "duration": 0.5, "delay": 0, "ease": "sine.out"}],
        )
    assert slide.animation is None


def test_set_user_animation_rejects_unsupported_slide():
    slide = _slide()
    entry = _entry(slide.id, 0, "", [])
    with pytest.raises(AnimationValidationError):
        set_user_animation(slide, entry, [])


def test_set_user_animation_empty_list_valid():
    slide = _slide()
    slide.animation = _plan("llm", "<p>x</p>", _elements("e0"), reset_from_user=True)
    entry = _entry(slide.id, 0, "<p>x</p>", _elements("e0"))

    plan = set_user_animation(slide, entry, [])

    assert plan["tweens"] == []
    assert plan["source"] == "user"
    assert plan["reset_from_user"] is False
    assert slide.animation == plan


def test_resolve_skips_slides_edited_while_planning(tmp_path, monkeypatch):
    """A hand edit committed while the LLM runs is never overwritten by the run."""
    deck = _Deck(tmp_path, count=3)
    els = _elements("e0", "e1")
    entries = [_entry(sid, i, f"<p>{i}</p>", els) for i, sid in enumerate(deck.slide_ids)]
    old_user = _plan("user", "<p>2 old</p>", _elements("e0"))  # stale_layout user plan
    asyncio.run(deck.seed({2: old_user}))
    state = _patch(monkeypatch, tmp_path, deck, entries)
    edited = _plan("user", "<p>0</p>", els, tweens=[
        {"target": "e1", "from_values": {"scale": 0.8}, "duration": 0.5, "delay": 0.3, "ease": "sine.out"}
    ])
    edited_2 = _plan("user", "<p>2</p>", els)
    planned_fn = sas.generate_slide_animations

    async def plans_while_user_edits(**kwargs):
        # Another request (a PUT) commits through its own session mid-run.
        async with deck.session_maker() as other:
            first = await other.get(SlideModel, deck.slide_ids[0])
            first.animation = edited
            third = await other.get(SlideModel, deck.slide_ids[2])
            third.animation = edited_2
            await other.commit()
        return await planned_fn(**kwargs)

    monkeypatch.setattr(sas, "generate_slide_animations", plans_while_user_edits)
    progress = []

    plans = deck.resolve(on_progress=progress.append)

    assert sorted(state["planned"]) == [0, 1, 2]
    stored = asyncio.run(deck.animations())
    assert stored[0] == edited
    assert stored[2] == edited_2
    assert stored[1]["source"] == "llm"
    assert plans[deck.slide_ids[0]] == edited
    assert progress[-1] == {"stage": "animation-plan", "done": 3, "total": 3}


def test_resolve_keeps_content_rewrite_when_nothing_changed(tmp_path, monkeypatch):
    """The stale-content user rewrite and legacy adoption still land alongside planned slides."""
    deck = _Deck(tmp_path, count=2)
    els = _elements("e0", "e1")
    entries = [
        _entry(deck.slide_ids[0], 0, "<p>0 new</p>", els),  # stale_content user: rewritten
        _entry(deck.slide_ids[1], 1, "<p>1</p>", els),  # missing: planned
    ]
    asyncio.run(deck.seed({0: _plan("user", "<p>0</p>", els)}))
    state = _patch(monkeypatch, tmp_path, deck, entries)

    deck.resolve()

    assert state["planned"] == [1]
    stored = asyncio.run(deck.animations())
    assert stored[0]["source"] == "user" and stored[0]["html_hash"] == _hash("<p>0 new</p>")
    assert stored[1]["source"] == "llm"
