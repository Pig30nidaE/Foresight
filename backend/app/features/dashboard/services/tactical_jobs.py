from __future__ import annotations

import threading
import time
import uuid
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional


JOB_TTL_SEC = 60 * 15


@dataclass
class TacticalAnalysisJob:
    job_id: str
    request_key: str
    username: str
    platform: str
    time_class: str
    max_games: int
    status: str = "queued"
    progress_percent: int = 0
    stage: str = "queued"
    message: str = "대기 중"
    total_games: int = 0
    analyzed_games: int = 0
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        if self.result is not None:
            payload["result"] = deepcopy(self.result)
        return payload


class TacticalAnalysisJobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, TacticalAnalysisJob] = {}
        self._latest_by_request: Dict[str, str] = {}
        self._lock = threading.Lock()

    def create_job(self, *, request_key: str, username: str, platform: str, time_class: str, max_games: int) -> TacticalAnalysisJob:
        job = TacticalAnalysisJob(
            job_id=str(uuid.uuid4()),
            request_key=request_key,
            username=username,
            platform=platform,
            time_class=time_class,
            max_games=max_games,
        )
        with self._lock:
            self._prune_locked()
            self._jobs[job.job_id] = job
            self._latest_by_request[request_key] = job.job_id
            return deepcopy(job)

    def get_job(self, job_id: str) -> Optional[TacticalAnalysisJob]:
        with self._lock:
            job = self._jobs.get(job_id)
            return deepcopy(job) if job else None

    def get_latest_for_request(self, request_key: str) -> Optional[TacticalAnalysisJob]:
        with self._lock:
            self._prune_locked()
            job_id = self._latest_by_request.get(request_key)
            if not job_id:
                return None
            job = self._jobs.get(job_id)
            return deepcopy(job) if job else None

    def update_job(
        self,
        job_id: str,
        *,
        status: Optional[str] = None,
        progress_percent: Optional[int] = None,
        stage: Optional[str] = None,
        message: Optional[str] = None,
        total_games: Optional[int] = None,
        analyzed_games: Optional[int] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[TacticalAnalysisJob]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None

            if status is not None:
                job.status = status
            if progress_percent is not None:
                job.progress_percent = max(0, min(100, int(round(progress_percent))))
            if stage is not None:
                job.stage = stage
            if message is not None:
                job.message = message
            if total_games is not None:
                job.total_games = max(0, int(total_games))
            if analyzed_games is not None:
                job.analyzed_games = max(0, int(analyzed_games))
            if result is not None:
                job.result = deepcopy(result)
            if error is not None:
                job.error = error
            job.updated_at = time.time()
            return deepcopy(job)

    def complete_job(self, job_id: str, result: Dict[str, Any], *, total_games: int) -> Optional[TacticalAnalysisJob]:
        return self.update_job(
            job_id,
            status="completed",
            progress_percent=100,
            stage="completed",
            message="전술 분석 완료",
            total_games=total_games,
            analyzed_games=total_games,
            result=result,
            error=None,
        )

    def fail_job(self, job_id: str, error: str) -> Optional[TacticalAnalysisJob]:
        return self.update_job(
            job_id,
            status="failed",
            stage="failed",
            message="전술 분석 실패",
            error=error,
        )

    def _prune_locked(self) -> None:
        now = time.time()
        expired_job_ids = [job_id for job_id, job in self._jobs.items() if (now - job.updated_at) > JOB_TTL_SEC]
        for job_id in expired_job_ids:
            request_key = self._jobs[job_id].request_key
            self._jobs.pop(job_id, None)
            if self._latest_by_request.get(request_key) == job_id:
                self._latest_by_request.pop(request_key, None)


tactical_job_store = TacticalAnalysisJobStore()