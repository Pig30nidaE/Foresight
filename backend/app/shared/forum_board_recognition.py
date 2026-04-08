"""Chess board image → FEN recognition using chessimg2pos."""

import os
import re
import tempfile
import io
from typing import TypedDict
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

import chess

_predictor = None
_CHESSIMG2POS_AVAILABLE = True

try:
    from chessimg2pos import predict_fen as _raw_predict_fen
except (ImportError, RuntimeError, OSError):
    # ImportError: package missing. RuntimeError: torch/torchvision ABI mismatch (e.g. torchvision::nms).
    # OSError: missing shared libs in minimal images.
    _CHESSIMG2POS_AVAILABLE = False
    _raw_predict_fen = None  # type: ignore[assignment]


class BoardRecognitionResult(TypedDict):
    fen: str
    confidence: float | None


def _compress_fen_row(row: str) -> str:
    """Compress consecutive '1's into digit counts: '11p11K11' -> '2p2K2'."""
    return re.sub(r"1+", lambda m: str(len(m.group(0))), row)


def _normalize_piece_placement(raw: str) -> str:
    rows = raw.split("/")
    return "/".join(_compress_fen_row(r) for r in rows)


def _to_full_fen(piece_placement: str) -> str:
    """Append default FEN fields if only piece placement is given."""
    parts = piece_placement.strip().split()
    if len(parts) == 1:
        return f"{parts[0]} w KQkq - 0 1"
    return piece_placement.strip()


def _preprocess_board_image(image_bytes: bytes) -> bytes:
    """Preprocess image to improve chessimg2pos accuracy (crop square, enhance)."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # 1. auto-crop monochrome background (like OS screenshot shadow/border)
    bg = Image.new(img.mode, img.size, img.getpixel((0, 0)))
    diff = ImageChops.difference(img, bg)
    bbox = diff.getbbox()
    if bbox:
        img = img.crop(bbox)

    width, height = img.size

    # 2. force exact square (chessimg2pos crushes to 256x256, destroying aspect ratio)
    if width != height:
        min_dim = min(width, height)
        if height > width:
            # Tall image (mobile screenshot): board is usually centered
            top = (height - min_dim) // 2
            img = img.crop((0, top, min_dim, top + min_dim))
        else:
            # Wide image
            if width > height * 1.2:
                # Assuming board is on the left
                img = img.crop((0, 0, min_dim, min_dim))
            else:
                # Slightly wide, center crop
                left = (width - min_dim) // 2
                img = img.crop((left, 0, left + min_dim, min_dim))

    # 3. Enhance contrast to clarify tall piece crowns
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.15)

    # 4. Sharpen (helps preserve edge details when chessimg2pos downscales)
    img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def recognize_board_from_image(image_bytes: bytes) -> BoardRecognitionResult:
    """Synchronous — run in a thread pool from async context."""
    if not _CHESSIMG2POS_AVAILABLE or _raw_predict_fen is None:
        raise RuntimeError("chessimg2pos is not installed")

    processed_bytes = _preprocess_board_image(image_bytes)

    fd, tmp_path = tempfile.mkstemp(suffix=".png")
    try:
        os.write(fd, processed_bytes)
        os.close(fd)

        raw_result = _raw_predict_fen(tmp_path)

        if isinstance(raw_result, dict):
            raw_fen = raw_result.get("fen", "")
            confidence = raw_result.get("confidence")
        else:
            raw_fen = str(raw_result)
            confidence = None

        normalized = _normalize_piece_placement(raw_fen.split()[0])
        full_fen = _to_full_fen(normalized)

        board = chess.Board(full_fen)
        validated_fen = board.fen()

        return BoardRecognitionResult(fen=validated_fen, confidence=confidence)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def is_recognition_available() -> bool:
    return _CHESSIMG2POS_AVAILABLE
