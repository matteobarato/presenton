from _video_http_helpers import _build_client, _placeholders, _rows, _slide_ui, _upload
from models.sql.slide_video import SlideVideoModel

BASE = "/api/v1/ppt/presentation"


def test_post_placeholder_adds_one_and_the_slide_shows_it(tmp_path, monkeypatch):
    client, presentation_id, slide_ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )

    response = client.post(f"{BASE}/{presentation_id}/videos/0/placeholder", json={})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slide_index"] == 0
    assert body["slide_id"] == str(slide_ids[0])
    assert body["placeholder"] == {
        "position": {"x": 936, "y": 516},
        "size": {"width": 320, "height": 180},
    }
    assert len(_placeholders(body["ui"])) == 1

    # Posting again moves it rather than adding a second one.
    moved = client.post(
        f"{BASE}/{presentation_id}/videos/0/placeholder", json={"x": 10, "y": 20}
    )
    assert moved.json()["placeholder"]["position"] == {"x": 10, "y": 20}
    assert len(_placeholders(_slide_ui(client, presentation_id, 0))) == 1


def test_post_placeholder_on_a_non_template_slide_is_422(tmp_path, monkeypatch):
    client, presentation_id, *_ = _build_client(tmp_path, monkeypatch)

    response = client.post(f"{BASE}/{presentation_id}/videos/2/placeholder", json={})

    assert response.status_code == 422


def test_delete_placeholder_after_upload_removes_video_and_placeholder(
    tmp_path, monkeypatch
):
    client, presentation_id, _ids, sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    assert _upload(client, presentation_id, 0).status_code == 200

    response = client.delete(f"{BASE}/{presentation_id}/videos/0/placeholder")

    assert response.status_code == 200
    assert response.json() == {"removed": True}
    assert client.get(f"{BASE}/{presentation_id}/videos/0").status_code == 404
    assert _placeholders(_slide_ui(client, presentation_id, 0)) == []
    assert _rows(sessions, SlideVideoModel) == []
    again = client.delete(f"{BASE}/{presentation_id}/videos/0/placeholder")
    assert again.json() == {"removed": False}


def _png(size=(40, 30)) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, "blue").save(buffer, "PNG")
    return buffer.getvalue()


def _put_portrait(client, presentation_id, data=None, filename="me.png"):
    return client.put(
        f"{BASE}/{presentation_id}/videos/portrait",
        files={"file": (filename, data if data is not None else _png(), "image/png")},
    )


def test_portrait_put_get_and_delete(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    # A literal segment, not swallowed by /{slide_index}.
    assert client.get(f"{BASE}/{presentation_id}/videos/portrait").status_code == 404

    put = _put_portrait(client, presentation_id)
    assert put.status_code == 200, put.text
    assert (put.json()["width"], put.json()["height"]) == (40, 30)

    got = client.get(f"{BASE}/{presentation_id}/videos/portrait")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.content == _png()

    assert client.delete(f"{BASE}/{presentation_id}/videos/portrait").status_code == 200
    assert client.get(f"{BASE}/{presentation_id}/videos/portrait").status_code == 404


def test_portrait_rejects_a_non_image(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    response = _put_portrait(client, presentation_id, data=b"nope", filename="x.png")
    assert response.status_code == 422


def test_videos_listing_carries_portrait_and_generation_flag(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, _app_data = _build_client(
        tmp_path, monkeypatch
    )
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    body = client.get(f"{BASE}/{presentation_id}/videos").json()
    assert body["portrait"] is None
    assert body["generation_available"] is False

    _put_portrait(client, presentation_id)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    body = client.get(f"{BASE}/{presentation_id}/videos").json()
    assert body["portrait"]["mime_type"] == "image/png"
    assert body["generation_available"] is True


def test_deleting_the_deck_removes_the_portrait_file(tmp_path, monkeypatch):
    client, presentation_id, _ids, _sessions, app_data = _build_client(
        tmp_path, monkeypatch
    )
    _put_portrait(client, presentation_id)
    folder = app_data / "videos" / str(presentation_id)
    assert list(folder.glob("portrait-*"))

    assert client.delete(f"{BASE}/{presentation_id}").status_code == 204
    assert not folder.exists()
