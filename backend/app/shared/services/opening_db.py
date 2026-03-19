"""
오프닝 데이터베이스 서비스
출처: lichess-org/chess-openings (GitHub, MIT License)
    https://github.com/lichess-org/chess-openings

ECO 코드(A00~E99) ↔ 정식 오프닝 이름·수순(PGN/UCI/EPD) 조회.
첫 실행 시 GitHub Raw에서 TSV 5개를 다운로드하고
backend/app/services/_eco_cache.json 에 캐시합니다.
이후 실행에서는 캐시만 사용합니다.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_CACHE_PATH = Path(__file__).parent / "_eco_cache.json"

# lichess-org/chess-openings — raw TSV (header: eco\tname\tpgn\tuci\tepd)
_TSV_URLS: list[str] = [
    "https://raw.githubusercontent.com/lichess-org/chess-openings/master/a.tsv",
    "https://raw.githubusercontent.com/lichess-org/chess-openings/master/b.tsv",
    "https://raw.githubusercontent.com/lichess-org/chess-openings/master/c.tsv",
    "https://raw.githubusercontent.com/lichess-org/chess-openings/master/d.tsv",
    "https://raw.githubusercontent.com/lichess-org/chess-openings/master/e.tsv",
]

# ── 내부 DB 구조 ─────────────────────────────────────────────
# _by_eco: eco → { name, pgn, uci, epd }  (첫 번째 즉 루트 항목 기준)
# _by_epd: epd → { eco, name, uci }        (포지션 기반 조회용)
_by_eco: dict[str, dict] = {}
_by_epd: dict[str, dict] = {}


def _normalize_epd(epd: str) -> str:
    """
    lichess-org/chess-openings의 epd 키는 보통 "piece turn castling ep" 4필드 형태.
    python-chess의 Board.epd()는 hmvc/fmvn 같은 operations를 붙일 수 있어서 그대로면 매칭이 깨질 수 있다.
    여기서는 공백 기준 앞의 4필드만 사용해 키를 정규화한다.
    """
    if not epd:
        return epd
    parts = epd.strip().split()
    return " ".join(parts[:4]) if len(parts) >= 4 else epd.strip()


# ── TSV 파싱 ─────────────────────────────────────────────────
def _parse_tsv(text: str) -> list[dict]:
    rows: list[dict] = []
    for line in text.strip().splitlines():
        if not line or line.startswith("eco") or line.startswith("ECO"):  # 헤더 스킵
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        eco = parts[0].strip()
        name = parts[1].strip()
        pgn = parts[2].strip() if len(parts) > 2 else ""
        uci = parts[3].strip() if len(parts) > 3 else ""
        epd = parts[4].strip() if len(parts) > 4 else ""
        rows.append({"eco": eco, "name": name, "pgn": pgn, "uci": uci, "epd": epd})
    return rows


# ── DB 구축 ──────────────────────────────────────────────────
def _build_indexes(rows: list[dict]) -> None:
    global _by_eco, _by_epd
    for row in rows:
        eco = row["eco"]
        # eco 기준: 가장 짧은 PGN(= 루트 오프닝)이 먼저 나오므로 첫 등장 우선
        if eco not in _by_eco:
            _by_eco[eco] = {
                "name": row["name"],
                "pgn": row["pgn"],
                "uci": row["uci"],
                "epd": row["epd"],
            }
        # epd 기준: 포지션별 정확한 이름 저장 (모든 변형 포함)
        epd_raw = (row.get("epd") or "").strip()
        if epd_raw:
            key = _normalize_epd(epd_raw)
            _by_epd[key] = {"eco": eco, "name": row["name"], "uci": row.get("uci", "")}
            continue

        # ── Fallback: TSV에 epd가 비어있는 경우가 있어 PGN으로 포지션을 계산 ──
        pgn_line = (row.get("pgn") or "").strip()
        if not pgn_line:
            continue

        try:
            import chess  # type: ignore
        except Exception:
            continue

        try:
            board = chess.Board()
            # 매우 단순한 SAN 토큰 파서: 숫자, 결과, 코멘트 등을 제거하고 SAN만 적용
            tokens = (
                pgn_line.replace("\n", " ")
                .replace("{", " { ")
                .replace("}", " } ")
                .split()
            )
            in_comment = False
            for tok in tokens:
                if tok == "{":
                    in_comment = True
                    continue
                if tok == "}":
                    in_comment = False
                    continue
                if in_comment:
                    continue
                if tok.endswith(".") or tok.count(".") >= 1:
                    continue
                if tok in ("1-0", "0-1", "1/2-1/2", "*"):
                    continue
                # NAG/annotation 제거 (e4!, e4?! 등은 python-chess에서 처리하지만 안전하게 일부 trim)
                san = tok.strip()
                if not san:
                    continue
                move = board.parse_san(san)
                board.push(move)

            key = _normalize_epd(" ".join(board.fen().split()[:4]))
            _by_epd[key] = {"eco": eco, "name": row["name"], "uci": row.get("uci", "")}
        except Exception:
            continue


def _all_rows_for_cache(rows: list[dict]) -> list[dict]:
    return rows


# ── 로딩 (FastAPI startup에서 호출) ──────────────────────────
async def load_opening_db(force_refresh: bool = False) -> int:
    """
    lichess ECO 데이터베이스를 로드합니다.
    캐시가 있으면 캐시에서, 없으면 GitHub Raw에서 다운로드합니다.
    Returns: 총 항목 수
    """
    global _by_eco, _by_epd

    # 이미 로드됨
    if _by_eco and not force_refresh:
        return len(_by_eco)

    all_rows: list[dict] = []

    # ── 캐시 로드 ────────────────────────────────────────────
    if _CACHE_PATH.exists() and not force_refresh:
        try:
            with open(_CACHE_PATH, encoding="utf-8") as f:
                cached = json.load(f)
            all_rows = cached.get("rows", [])
            logger.info(f"[OpeningDB] 캐시에서 {len(all_rows)}개 항목 로드")
        except Exception as e:
            logger.warning(f"[OpeningDB] 캐시 읽기 실패, 재다운로드: {e}")
            all_rows = []

    # ── GitHub에서 다운로드 ──────────────────────────────────
    if not all_rows:
        logger.info("[OpeningDB] GitHub Raw에서 TSV 다운로드 중...")
        async with httpx.AsyncClient(timeout=30) as client:
            for url in _TSV_URLS:
                letter = url.split("/")[-1][0].upper()
                try:
                    r = await client.get(url)
                    r.raise_for_status()
                    rows = _parse_tsv(r.text)
                    all_rows.extend(rows)
                    logger.info(f"[OpeningDB] {letter}계열 {len(rows)}개 로드")
                except Exception as e:
                    logger.error(f"[OpeningDB] {url} 다운로드 실패: {e}")

        # 캐시 저장
        if all_rows:
            try:
                _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(_CACHE_PATH, "w", encoding="utf-8") as f:
                    json.dump({"rows": all_rows}, f, ensure_ascii=False)
                logger.info(f"[OpeningDB] 캐시 저장 완료: {_CACHE_PATH}")
            except Exception as e:
                logger.warning(f"[OpeningDB] 캐시 저장 실패: {e}")

    _build_indexes(all_rows)
    logger.info(f"[OpeningDB] 준비 완료 — ECO {len(_by_eco)}개, 포지션 {len(_by_epd)}개")
    return len(_by_eco)


# ── 공개 조회 API ────────────────────────────────────────────

def get_name_by_eco(eco: str) -> Optional[str]:
    """
    ECO 코드 → 정식 오프닝 이름 (루트)
    예) "B12" → "Caro-Kann Defense"
    DB 미로드 또는 미존재 시 None 반환.
    """
    entry = _by_eco.get(eco)
    return entry["name"] if entry else None


def get_entry_by_eco(eco: str) -> Optional[dict]:
    """ECO 코드 → {name, pgn, uci, epd}"""
    return _by_eco.get(eco)


def get_entry_by_epd(epd: str) -> Optional[dict]:
    """
    포지션(EPD) → {eco, name, uci}
    PGN에서 현재 포지션을 계산한 뒤 정확한 오프닝 변형을 조회할 때 사용.
    """
    return _by_epd.get(_normalize_epd(epd))


def is_loaded() -> bool:
    return bool(_by_eco)


def stats() -> dict:
    return {"eco_count": len(_by_eco), "position_count": len(_by_epd)}


# ── ECO family labels (A~E) ─────────────────────────────────
ECO_FAMILY_NAMES: dict[str, str] = {
    "A": "A — Flank & Irregular Openings",
    "B": "B — Semi-Open Games (1.e4)",
    "C": "C — Open Games (1.e4 e5)",
    "D": "D — Closed & Semi-Closed Games",
    "E": "E — Indian Defences (1.d4 Nf6)",
}
