"""
미완료 가입자 자동 정리 스케줄러
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.forum import User
from app.db.session import async_sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)


async def cleanup_incomplete_signups(session: AsyncSession) -> int:
    """
    signup_completed=False이고 INCOMPLETE_SIGNUP_CLEANUP_HOURS 이상 경과한 유저를 삭제합니다.
    
    Returns:
        삭제된 유저 개수
    """
    cutoff_time = datetime.utcnow() - timedelta(hours=settings.INCOMPLETE_SIGNUP_CLEANUP_HOURS)
    
    # 삭제 대상 유저 개수 확인
    count_query = select(User).where(
        (User.signup_completed == False) &
        (User.created_at < cutoff_time)
    )
    result = await session.execute(count_query)
    users_to_delete = result.scalars().all()
    count = len(users_to_delete)
    
    if count > 0:
        # 삭제 (cascading delete가 관계 처리)
        delete_query = delete(User).where(
            (User.signup_completed == False) &
            (User.created_at < cutoff_time)
        )
        await session.execute(delete_query)
        await session.commit()
        logger.info(f"[Cleanup] 미완료 가입자 {count}명 삭제됨 (>{settings.INCOMPLETE_SIGNUP_CLEANUP_HOURS}시간 경과)")
    
    return count


async def start_incomplete_signup_cleanup_task() -> asyncio.Task:
    """
    주기적으로 미완료 가입자를 정리하는 백그라운드 태스크를 시작합니다.
    """
    async def cleanup_loop():
        # 초기 대기: 시작 후 1분 뒤 첫 실행
        await asyncio.sleep(60)
        
        while True:
            try:
                async with async_sessionmaker() as session:
                    await cleanup_incomplete_signups(session)
            except Exception as e:
                logger.error(f"[Cleanup] 미완료 가입자 정리 중 오류: {e}")
            
            # 1시간마다 확인
            await asyncio.sleep(3600)
    
    task = asyncio.create_task(cleanup_loop())
    logger.info(f"[Startup] 미완료 가입자 정리 스케줄러 시작 (주기: 1시간, 타임아웃: {settings.INCOMPLETE_SIGNUP_CLEANUP_HOURS}시간)")
    return task


def stop_incomplete_signup_cleanup_task(task: asyncio.Task) -> None:
    """
    미완료 가입자 정리 태스크를 중지합니다.
    """
    if task and not task.done():
        task.cancel()
        logger.info("[Shutdown] 미완료 가입자 정리 스케줄러 중지")
