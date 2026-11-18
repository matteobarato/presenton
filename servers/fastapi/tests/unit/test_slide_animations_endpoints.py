import asyncio
import hashlib
import uuid

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.v1.ppt.endpoints.slide_animations as endpoint
import services.slide_animation_service as sas
from api.v1.ppt.endpoints.slide_animations import SLIDE_ANIMATIONS_ROUTER
from models.sql.async_task import AsyncTaskModel
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.user import User  # noqa: F401
from services.database import get_async_session
from services.slide_animation_service import targets_signature


def _hash(html):
    return hashlib.sha256(html.encode()).hexdigest()


def _elements(*ids):
    return [
        {"id": i, "kind": "text", "box": {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0}, "text": f"t{i}"}
        for i in ids
    ]


def _plan(source, html, elements):
    return {
        "version": 1,
        "source": source,
        "html_hash": _hash(html),
        "targets_signature": targets_signature(elements),
        "tweens": [
            {"target": "e0", "from_values": {"opacity": 0.0}, "duration": 0.5, "delay": 0.0, "ease": "power2.out"}
        ],
        "reset_from_user": False,
        "updated_at": "2026-11-01T00:00:00+00:00",
    }


class Env:
    def __init__(self, tmp_path, monkeypatch):
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'a.db'}")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.pid = uuid.uuid4()
        self.ids = [uuid.uuid4() for _ in range(3)]
        self.composition = {}
        self.fetches = 0
        self.error = None
        self.planned = []
        monkeypatch.setattr(sas, "_fetch_video_composition", self._fetch)
        monkeypatch.setattr(endpoint, "async_session_maker", self.sessions)

        async def fake_generate(*, slides, slide_count, deck_title):
            self.planned.append([p for p, _ in slides])
            return {
                p: [sas.SlideTween("e0", {"opacity": 0.0}, 0.5, 0.0, "power2.out")]
                for p, _ in slides
            }

        monkeypatch.setattr(sas, "generate_slide_animations", fake_generate)

    async def _fetch(self, presentation_id, cookie):
        self.fetches += 1
        if self.error:
            raise self.error
        return {"slides": list(self.composition.values())}

    async def seed(self, stored=None):
        async with self.engine.begin() as conn:
            for m in (User, PresentationModel, SlideModel, AsyncTaskModel):
                await conn.run_sync(m.__table__.create)
        async with self.sessions() as s:
            s.add(PresentationModel(id=self.pid, version=PresentationVersion.V2_STANDARD,
                                    content="d", n_slides=3, language="English", title="Deck"))
            for i, sid in enumerate(self.ids):
                s.add(SlideModel(id=sid, presentation=self.pid, layout_group="g", layout="l",
                                 index=i, content={}, animation=(stored or {}).get(i)))
            await s.commit()
        for i, sid in enumerate(self.ids):
            html = None if i == 2 else f"<p>{i}</p>"
            self.composition[i] = {"id": str(sid), "index": i, "html": html,
                                   "elements": _elements("e0", "e1") if html else []}

    async def client(self):
        app = FastAPI()
        app.include_router(SLIDE_ANIMATIONS_ROUTER, prefix="/api/v1/ppt")

        async def session():
            async with self.sessions() as s:
                yield s

        app.dependency_overrides[get_async_session] = session
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")

    def url(self, suffix=""):
        return f"/api/v1/ppt/presentation/{self.pid}/animations{suffix}"


def run(tmp_path, monkeypatch, body, stored=None):
    env = Env(tmp_path, monkeypatch)

    async def go():
        await env.seed(stored)
        async with await env.client() as client:
            return await body(env, client)

    return asyncio.run(go())


def test_get_shape_and_statuses(tmp_path, monkeypatch):
    stored = {0: _plan("llm", "<p>0</p>", _elements("e0", "e1")), 1: _plan("user", "<p>old</p>", _elements("e0", "e1"))}

    async def body(env, client):
        r = await client.get(env.url())
        assert r.status_code == 200
        slides = r.json()["slides"]
        assert [s["status"] for s in slides] == ["fresh", "stale_content", "unsupported"]
        assert slides[0]["slide_id"] == str(env.ids[0])
        assert slides[0]["source"] == "llm" and slides[0]["reset_from_user"] is False
        assert slides[0]["tweens"][0]["target"] == "e0"
        assert slides[0]["targets"][0] == {"id": "e0", "kind": "text", "box": {"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0}, "text": "te0"}
        assert slides[1]["source"] == "user"
        assert slides[2]["source"] is None and slides[2]["tweens"] == [] and slides[2]["targets"] == []
        assert env.planned == []

    run(tmp_path, monkeypatch, body, stored)


def test_get_missing(tmp_path, monkeypatch):
    async def body(env, client):
        slides = (await client.get(env.url())).json()["slides"]
        assert [s["status"] for s in slides] == ["missing", "missing", "unsupported"]
        assert slides[0]["source"] is None and slides[0]["tweens"] == []

    run(tmp_path, monkeypatch, body)


def test_post_scope_and_force(tmp_path, monkeypatch):
    stored = {0: _plan("user", "<p>0</p>", _elements("e0", "e1"))}

    async def body(env, client):
        r = await client.post(env.url(), json={"slide_indexes": [0, 1]})
        assert r.status_code == 200
        assert env.planned == [[1]]  # slide 0 is fresh, slide 2 out of scope
        slides = r.json()["slides"]
        assert [s["status"] for s in slides] == ["fresh", "fresh", "unsupported"]
        assert slides[0]["source"] == "user" and slides[1]["source"] == "llm"
        assert env.fetches == 1

        r = await client.post(env.url(), json={"slide_indexes": [0], "force": True})
        assert env.planned[-1] == [0]
        assert r.json()["slides"][0]["source"] == "llm"

        assert (await client.post(env.url(), json={"slide_indexes": [9]})).status_code == 404

    run(tmp_path, monkeypatch, body, stored)


def test_put_normalizes_and_422(tmp_path, monkeypatch):
    async def body(env, client):
        tween = {"target": "e1", "from_values": {"opacity": 0.0, "x": -30}, "duration": 99, "delay": 0, "ease": "power2.out"}
        r = await client.put(env.url("/0"), json={"tweens": [tween, {**tween, "target": "nope"}]})
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry["status"] == "fresh" and entry["source"] == "user"
        assert [t["target"] for t in entry["tweens"]] == ["e1"]
        assert entry["tweens"][0]["duration"] < 99
        again = (await client.get(env.url())).json()["slides"][0]
        assert again["source"] == "user"

        bad = await client.put(env.url("/0"), json={"tweens": [{**tween, "target": "nope"}]})
        assert bad.status_code == 422
        assert (await client.put(env.url("/2"), json={"tweens": []})).status_code == 422
        assert (await client.put(env.url("/0"), json={"tweens": []})).json()["tweens"] == []
        assert (await client.put(env.url("/9"), json={"tweens": []})).status_code == 404

    run(tmp_path, monkeypatch, body)


def test_delete_then_missing(tmp_path, monkeypatch):
    stored = {0: _plan("llm", "<p>0</p>", _elements("e0", "e1"))}

    async def body(env, client):
        assert (await client.delete(env.url("/0"))).status_code == 204
        assert (await client.get(env.url())).json()["slides"][0]["status"] == "missing"
        assert (await client.delete(env.url("/9"))).status_code == 404

    run(tmp_path, monkeypatch, body, stored)


def test_not_found_and_502(tmp_path, monkeypatch):
    async def body(env, client):
        missing = f"/api/v1/ppt/presentation/{uuid.uuid4()}/animations"
        assert (await client.get(missing)).status_code == 404
        assert (await client.post(missing, json={})).status_code == 404
        env.error = sas.AnimatedVideoUnavailableError("Slide HTML could not be loaded (HTTP 500)")
        for r in (
            await client.get(env.url()),
            await client.post(env.url(), json={}),
            await client.put(env.url("/0"), json={"tweens": []}),
        ):
            assert r.status_code == 502
            assert "HTTP 500" in r.json()["detail"]

    run(tmp_path, monkeypatch, body)


def test_async_task(tmp_path, monkeypatch):
    async def body(env, client):
        r = await client.post(env.url("/async"), json={})
        assert r.status_code == 200, r.text
        task = r.json()
        assert task["type"] == "presentation.animations"
        async with env.sessions() as s:
            row = await s.get(AsyncTaskModel, task["id"])
        assert row.status == "completed"
        assert row.data["presentation_id"] == str(env.pid)
        assert (row.data["done"], row.data["total"]) == (2, 2)
        assert env.planned == [[0, 1]]

        env.error = sas.AnimatedVideoUnavailableError("boom")
        task = (await client.post(env.url("/async"), json={})).json()
        async with env.sessions() as s:
            row = await s.get(AsyncTaskModel, task["id"])
        assert row.status == "error" and "boom" in row.error["detail"]

    run(tmp_path, monkeypatch, body)
