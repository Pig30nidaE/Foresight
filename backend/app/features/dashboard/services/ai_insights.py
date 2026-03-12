"""
AI 코치 인사이트 서비스
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stockfish 분석 결과 + 전술 패턴 데이터를 GPT-4o-mini 에 넘겨
한국어 자연어 인사이트를 생성합니다.

OPENAI_API_KEY 가 없으면 규칙 기반 폴백을 반환합니다.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from app.core.config import settings

logger = logging.getLogger(__name__)


async def generate_tactical_insights(
    analysis: Dict[str, Any],
    username: str,
) -> Dict[str, Any]:
    """
    전술 분석 결과를 기반으로 GPT-4o-mini 로 자연어 인사이트 생성.
    API 키 없거나 호출 실패 시 규칙 기반 폴백 반환.
    """
    if not settings.OPENAI_API_KEY:
        logger.info("[AI Insights] OPENAI_API_KEY 없음 → 규칙 기반 폴백")
        return _fallback_insights(analysis)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = _build_prompt(analysis, username)

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "당신은 경험 많은 체스 코치입니다. "
                        "선수의 게임 데이터를 분석하여 구체적이고 실용적인 조언을 제공합니다. "
                        "반드시 지정된 JSON 형식으로만 응답하고, 한국어로 작성하세요."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.65,
            max_tokens=900,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        result = json.loads(content)
        result["generated_by"] = "gpt-4o-mini"
        return result

    except Exception as exc:
        logger.warning(f"[AI Insights] OpenAI 호출 실패 ({exc}) → 규칙 기반 폴백")
        return _fallback_insights(analysis)


# ─────────────────────────────────────────────────────────────
# 내부 헬퍼
# ─────────────────────────────────────────────────────────────

def _build_prompt(analysis: Dict[str, Any], username: str) -> str:
    total = analysis.get("total_games", 0)
    strengths: List[dict] = analysis.get("strengths", [])
    weaknesses: List[dict] = analysis.get("weaknesses", [])
    patterns: List[dict] = analysis.get("patterns", [])

    s_lines = "\n".join(
        f"  - {p['label']}({p['score']}점): {p['detail']}"
        for p in strengths
    ) or "  (없음)"
    w_lines = "\n".join(
        f"  - {p['label']}({p['score']}점): {p['detail']}"
        for p in weaknesses
    ) or "  (없음)"

    all_patterns = "\n".join(
        f"  {'[강점]' if p['is_strength'] else '[약점]'} {p['label']}: "
        f"{p['score']}점 — {p['detail']}"
        for p in patterns
    )

    cluster_block = ""
    ca = analysis.get("cluster_analysis")
    if ca:
        cluster_block = f"\n군집 분석: {ca['summary']}"
        for c in ca.get("clusters", []):
            cluster_block += (
                f"\n  클러스터 '{c['label']}': {c['win_rate']}% 승률 "
                f"({c['n_games']}게임) | 특성: {', '.join(c['key_traits'])}"
            )

    xgb_block = ""
    xgb = analysis.get("xgboost_profile")
    if xgb:
        factors = ", ".join(f["feature"] for f in xgb.get("top_risk_factors", []))
        acc = xgb.get("model_accuracy", 0)
        precision = xgb.get("precision", 0)
        recall = xgb.get("recall", 0)
        f1 = xgb.get("f1", 0)
        lift = xgb.get("lift_over_baseline", 0)
        quality_note = xgb.get("quality_note", "")
        xgb_block = (
            f"\nXGBoost 블런더 위험 요소: {factors} "
            f"(정확도: {acc:.0f}%, 정밀도: {precision:.0f}%, 재현율: {recall:.0f}%, F1: {f1:.0f}%, "
            f"베이스라인 대비 개선: {lift:+.1f}pp)"
        )
        if quality_note:
            xgb_block += f"\n모델 신뢰도 코멘트: {quality_note}"

    return f"""체스 플레이어 "{username}"의 게임 분석 결과입니다 (총 {total}게임).

─ 상위 강점 ─
{s_lines}

─ 상위 약점 ─
{w_lines}

─ 전체 패턴 ─
{all_patterns}
{cluster_block}
{xgb_block}

위 데이터를 바탕으로 다음 JSON 구조로 정확히 응답해주세요:

{{
  "strengths_summary": "강점에 대한 2~3문장 분석. 왜 강한지, 어떤 상황에서 잘하는지.",
  "weaknesses_summary": "약점에 대한 2~3문장 분석. 어떤 상황에서 실수가 많은지, 패턴은 무엇인지.",
  "best_situation": "가장 잘하는 상황 한 줄 (예: '시간 압박 블리츠에서 직관력 발휘')",
  "worst_situation": "가장 취약한 상황 한 줄 (예: '퀸 교환 후 엔드게임 처리 미흡')",
  "recommendations": [
    "구체적 훈련 방법 1 (예: 종류 + 시간 + 방법)",
    "구체적 훈련 방법 2",
    "구체적 훈련 방법 3"
  ],
  "training_focus": "지금 당장 가장 집중해야 할 훈련 방향 한 문장"
}}"""


def _fallback_insights(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """OpenAI 없을 때 규칙 기반 인사이트."""
    strengths: List[dict] = analysis.get("strengths", [])
    weaknesses: List[dict] = analysis.get("weaknesses", [])

    s_labels = [p["label"] for p in strengths]
    w_labels = [p["label"] for p in weaknesses]
    s_scores = {p["label"]: p["score"] for p in strengths}
    w_scores = {p["label"]: p["score"] for p in weaknesses}

    best = s_labels[0] if s_labels else None
    worst = w_labels[0] if w_labels else None

    s_detail = (
        f"{', '.join(s_labels)} 분야에서 강세를 보이고 있습니다. "
        f"{'특히 ' + best + '(' + str(s_scores.get(best, '')) + '점)에서 두드러집니다. ' if best else ''}"
        "이 강점을 상대방 분석에 활용한 전략을 구사하세요."
        if s_labels else
        "아직 데이터가 충분하지 않아 강점 분석이 어렵습니다."
    )

    w_detail = (
        f"{', '.join(w_labels)} 분야에서 개선이 필요합니다. "
        f"{'특히 ' + worst + '(' + str(w_scores.get(worst, '')) + '점)이 가장 취약합니다. ' if worst else ''}"
        "집중적인 패턴 훈련을 권장합니다."
        if w_labels else
        "아직 약점 패턴이 명확하게 나타나지 않았습니다."
    )

    recs = [
        f"{'전술 퍼즐(특히 ' + worst + ' 관련)을' if worst else '전술 퍼즐을'} 하루 20–30개 풀어보세요.",
        "Lichess / Chess.com 게임 복기로 자신의 실수 패턴을 직접 확인하세요.",
        "약점 오프닝에 대한 레퍼토리를 정비하고 해당 라인을 집중적으로 연습하세요.",
    ]

    return {
        "strengths_summary": s_detail,
        "weaknesses_summary": w_detail,
        "best_situation": best or "분석 중",
        "worst_situation": worst or "분석 중",
        "recommendations": recs,
        "training_focus": (
            f"{worst} 향상에 집중하세요." if worst
            else "균형 잡힌 전술 훈련을 유지하세요."
        ),
        "generated_by": "rule-based",
    }
