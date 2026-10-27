import os

from utils.hyperframes_composition import (
    CompositionSlide,
    build_composition_html,
    localize_assets,
    resolve_local_asset,
    scope_slide_targets,
    timeline_entries,
    write_hyperframes_project,
)
from utils.llm_calls.generate_slide_animations import SlideTween


def _slide(index=0, start=0.0, duration=1.0, tweens=(), anchor=None):
    return CompositionSlide(
        slide_index=index,
        html='<div data-hf-el="e0"><p>Hi</p></div>',
        start_seconds=start,
        duration_seconds=duration,
        tweens=list(tweens),
        timeline_start_seconds=anchor,
    )


def test_scope_slide_targets_prefixes_ids_per_slide():
    assert scope_slide_targets('<i data-hf-el="e3"></i>', 7) == '<i data-hf-el="s7-e3"></i>'


def test_timeline_entries_position_tweens_from_the_slide_anchor():
    tween = SlideTween("e0", {"opacity": 0.0, "y": 20.0, "blur": 8.0}, 0.6, 0.25, "expo.out")
    (entry,) = timeline_entries([_slide(index=2, start=1.98, anchor=2.0, tweens=[tween])])
    assert entry["sel"] == '[data-hf-el="s2-e0"]'
    assert entry["at"] == 2.25
    assert entry["from"] == {"opacity": 0.0, "y": 20.0, "filter": "blur(8px)"}
    assert entry["to"] == {
        "opacity": 1.0,
        "y": 0.0,
        "filter": "blur(0px)",
        "duration": 0.6,
        "ease": "expo.out",
    }


def test_composition_html_follows_the_hyperframes_contract():
    html = build_composition_html(
        [_slide(0, 0.0, 1.5), _slide(1, 1.5, 0.5)], width=1920, height=1080
    )
    assert 'data-composition-id="deck" data-start="0" data-duration="2"' in html
    assert 'data-width="1920" data-height="1080"' in html
    assert '<section id="s1" class="clip" data-start="1.5" data-duration="0.5"' in html
    assert "transform:scale(1.5)" in html
    assert "gsap.timeline({paused:true})" in html
    assert 'window.__timelines["deck"]=tl' in html
    assert '<script src="vendor/gsap.min.js"></script>' in html


def test_timeline_script_cannot_be_closed_by_entry_data():
    tween = SlideTween("e0</script><script>alert(1)", {"opacity": 0.0}, 0.5, 0.0, "power2.out")
    html = build_composition_html([_slide(tweens=[tween])], width=1280, height=720)
    assert "</script><script>alert(1)" not in html


def test_localize_assets_copies_local_files_and_keeps_remote_ones(tmp_path):
    image = tmp_path / "photo.png"
    image.write_bytes(b"png")
    font = tmp_path / "font.woff2"
    font.write_bytes(b"woff")
    local = {
        "http://127.0.0.1:8000/app_data/images/photo.png?v=1&x=2": str(image),
        "/app_data/fonts/font.woff2": str(font),
    }
    markup = (
        '<img src="http://127.0.0.1:8000/app_data/images/photo.png?v=1&amp;x=2">'
        '<img src="https://images.example.com/a.jpg">'
        '<div style="background:url(&quot;/app_data/fonts/font.woff2&quot;)"></div>'
        '<style>@font-face{src:url("/app_data/fonts/font.woff2")}</style>'
        '<img src="/app_data/images/missing.png">'
    )
    assets = tmp_path / "project" / "assets"
    rewritten = localize_assets(markup, str(assets), local.get)

    copied = sorted(os.listdir(assets))
    assert len(copied) == 2
    png = next(name for name in copied if name.endswith(".png"))
    woff = next(name for name in copied if name.endswith(".woff2"))
    assert f'src="assets/{png}"' in rewritten
    assert 'src="https://images.example.com/a.jpg"' in rewritten
    assert rewritten.count(f"url(assets/{woff})") == 2
    assert 'src="/app_data/images/missing.png"' in rewritten


def test_resolve_local_asset_ignores_remote_and_inline_urls():
    assert resolve_local_asset("https://images.example.com/a.jpg") is None
    assert resolve_local_asset("data:image/png;base64,AAAA") is None
    assert resolve_local_asset("/vendor/../../../etc/passwd") is None


def test_write_project_includes_gsap_and_index(tmp_path):
    gsap = tmp_path / "gsap.min.js"
    gsap.write_text("/* gsap */")
    project = tmp_path / "project"
    index = write_hyperframes_project(
        str(project), [_slide()], width=1280, height=720, gsap_path=str(gsap)
    )
    assert os.path.isfile(index)
    assert (project / "vendor" / "gsap.min.js").read_text() == "/* gsap */"
