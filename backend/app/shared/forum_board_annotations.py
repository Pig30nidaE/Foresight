import re
from typing import Any

_SQUARE = re.compile(r"^[a-h][1-8]$")

ALLOWED_HIGHLIGHT_COLORS: frozenset[str] = frozenset(
    {
        "rgba(255,220,100,0.45)",
        "rgba(100,180,255,0.45)",
        "rgba(255,100,100,0.45)",
        "rgba(180,255,180,0.45)",
    }
)

_MAX_KEYS = 64
_MAX_EMOJI_LEN = 8
_MAX_BY_PLY_BUCKETS = 400
_MAX_PLY_NUM = 2000


def _validate_highlight_map(src: Any) -> dict[str, str]:
    if src is None:
        return {}
    if not isinstance(src, dict):
        raise ValueError("board_annotations.highlights must be an object")
    if len(src) > _MAX_KEYS:
        raise ValueError("Too many highlight squares")
    out: dict[str, str] = {}
    for k, v in src.items():
        if not isinstance(k, str) or not _SQUARE.match(k):
            raise ValueError(f"Invalid square key: {k!r}")
        if not isinstance(v, str) or v not in ALLOWED_HIGHLIGHT_COLORS:
            raise ValueError("Invalid highlight color")
        out[k] = v
    return out


def _validate_emoji_map(src: Any) -> dict[str, str]:
    if src is None:
        return {}
    if not isinstance(src, dict):
        raise ValueError("board_annotations.emojis must be an object")
    if len(src) > _MAX_KEYS:
        raise ValueError("Too many emoji squares")
    out: dict[str, str] = {}
    for k, v in src.items():
        if not isinstance(k, str) or not _SQUARE.match(k):
            raise ValueError(f"Invalid square key: {k!r}")
        if not isinstance(v, str) or len(v) > _MAX_EMOJI_LEN or not v.strip():
            raise ValueError("Invalid emoji value")
        out[k] = v
    return out


def validate_board_annotations_payload(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize and validate board_annotations JSON. Returns None if raw is None."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("board_annotations must be a JSON object")

    highlights = raw.get("highlights")
    emojis = raw.get("emojis")
    by_ply = raw.get("byPly")

    if highlights is not None and not isinstance(highlights, dict):
        raise ValueError("board_annotations.highlights must be an object")
    if emojis is not None and not isinstance(emojis, dict):
        raise ValueError("board_annotations.emojis must be an object")

    out_h = _validate_highlight_map(highlights if isinstance(highlights, dict) else {})
    out_e = _validate_emoji_map(emojis if isinstance(emojis, dict) else {})

    out_by: dict[str, dict[str, dict[str, str]]] = {}
    if by_ply is not None:
        if not isinstance(by_ply, dict):
            raise ValueError("board_annotations.byPly must be an object")
        if len(by_ply) > _MAX_BY_PLY_BUCKETS:
            raise ValueError("Too many byPly entries")
        for ply_key, layer in by_ply.items():
            if not isinstance(ply_key, str) or not ply_key.isdigit():
                raise ValueError(f"Invalid byPly key: {ply_key!r}")
            if int(ply_key) > _MAX_PLY_NUM:
                raise ValueError("Invalid ply index")
            if not isinstance(layer, dict):
                raise ValueError("byPly layer must be an object")
            lh = layer.get("highlights")
            le = layer.get("emojis")
            if lh is not None and not isinstance(lh, dict):
                raise ValueError("byPly highlights must be an object")
            if le is not None and not isinstance(le, dict):
                raise ValueError("byPly emojis must be an object")
            out_by[ply_key] = {
                "highlights": _validate_highlight_map(lh if isinstance(lh, dict) else {}),
                "emojis": _validate_emoji_map(le if isinstance(le, dict) else {}),
            }

    if not out_h and not out_e and not out_by:
        return {"highlights": {}, "emojis": {}}

    result: dict[str, Any] = {"highlights": out_h, "emojis": out_e}
    if out_by:
        result["byPly"] = out_by
    return result
