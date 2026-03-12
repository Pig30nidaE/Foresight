#!/usr/bin/env python3
"""
Hikaru 블리츠 게임의 희생 수 T4 판별 검증 스크립트
실제 T4로 분류된 수들이 정말 블런더인지, 아니면 오판인지 확인
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from app.shared.services.chessdotcom import ChessDotComService
from app.features.dashboard.services.tactical_analysis import TacticalAnalysisService


async def main():
    print("=" * 80)
    print("Hikaru 블리츠 게임 희생 수 T4 판별 검증")
    print("=" * 80)
    
    # 서비스 초기화
    cdotcom_svc = ChessDotComService()
    tactical_svc = TacticalAnalysisService()
    
    try:
        # Hikaru의 최근 블리츠 게임 로드
        print("\n[1] Hikaru 블리츠 게임 로드 중...")
        games = await cdotcom_svc.get_recent_games(
            "Hikaru",
            max_games=100,
            time_class="blitz"
        )
        
        if not games:
            print("❌ Hikaru의 게임을 찾을 수 없습니다.")
            return
        
        print(f"✓ {len(games)}개 게임 로드 완료")
        
        # 전술 분석 실행
        print("\n[2] 전술 패턴 분석 중...")
        patterns = tactical_svc.analyze(games, "Hikaru", len(games))
        
        print(f"✓ 분석 완료: {len(patterns)} 패턴")
        
        # 희생 패턴만 필터링
        sacrifice_patterns = [p for p in patterns if p.situation_id == 3]
        print(f"\n[3] 희생 패턴: {len(sacrifice_patterns)}개")
        
        if not sacrifice_patterns:
            print("❌ 희생 패턴을 찾을 수 없습니다.")
            return
        
        # 각 희생 패턴의 T4 수들을 분석
        for pidx, pattern in enumerate(sacrifice_patterns, 1):
            print(f"\n{'─' * 80}")
            print(f"패턴 {pidx}: {pattern.situation_label}")
            print(f"{'─' * 80}")
            
            chart_data = pattern.chart_data
            if chart_data and chart_data.get("type") == "sacrifice_tiers":
                t1 = chart_data.get("t1", 0)
                t2 = chart_data.get("t2", 0)
                t3 = chart_data.get("t3", 0)
                t4 = chart_data.get("t4", 0)
                total = chart_data.get("total", 0)
                avg_score = chart_data.get("avg_score", 0)
                
                print(f"T1 (탁월): {t1:3d} | T2 (전술): {t2:3d} | T3 (선택): {t3:3d} | T4 (실패): {t4:3d}")
                print(f"총계: {total:3d} | 평균 점수: {avg_score:.1f}점")
            else:
                print(f"chart_data: {chart_data}")
            
            # 대표 게임 확인
            evidence = pattern.evidence[:5]  # 처음 5개만
            if evidence:
                print(f"\n[대표 게임 (처음 5개)]")
                for gidx, game_rec in enumerate(evidence, 1):
                    game = game_rec["game"]
                    tier = game_rec.get("sac_tier", "?")
                    metric = game_rec.get("metric_value", "?")
                    context = game_rec.get("context", "?")
                    
                    print(f"  {gidx}. 게임 {game.game_id[-8:]}")
                    print(f"     T{tier} | 점수: {metric} | {context}")
                    
                    # 결과 표시
                    result_emoji = "✅" if game.result.value == "win" else "❌" if game.result.value == "loss" else "◼️"
                    print(f"     결과: {result_emoji} {game.result.value.upper()}")
        
        print(f"\n{'=' * 80}")
        print("분석 완료")
        print(f"{'=' * 80}")
        
    except Exception as e:
        print(f"\n❌ 에러: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
