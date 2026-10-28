from _video_http_helpers import _build_client
from models.sql.slide_video import SlideVideoModel
from test_slide_video_endpoint_http import _placeholders, _rows, _slide_ui, _upload

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
