from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TacticalJob:
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
    error: Optional[str] = None
    result: Any = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "request_key": self.request_key,
            "username": self.username,
            "platform": self.platform,
            "time_class": self.time_class,
            "max_games": self.max_games,
            "status": self.status,
            "progress_percent": self.progress_percent,
            "stage": self.stage,
            "message": self.message,
            "total_games": self.total_games,
            "analyzed_games": self.analyzed_games,
            "error": self.error,
            "result": self.result,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class TacticalJobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, TacticalJob] = {}
        self._latest_by_request: dict[str, str] = {}

    def create_job(self, request_key: str, username: str, platform: str, time_class: str, max_games: int) -> TacticalJob:
        with self._lock:
            job = TacticalJob(
                job_id=str(uuid.uuid4()),
                request_key=request_key,
                username=username,
                platform=platform,
                time_class=time_class,
                max_games=max_games,
            )
            self._jobs[job.job_id] = job
            self._latest_by_request[request_key] = job.job_id
            return job

    def get_job(self, job_id: str) -> Optional[TacticalJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def get_latest_for_request(self, request_key: str) -> Optional[TacticalJob]:
        with self._lock:
            job_id = self._latest_by_request.get(request_key)
            return self._jobs.get(job_id) if job_id else None

    def update_job(self, job_id: str, **updates) -> Optional[TacticalJob]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            for key, value in updates.items():
                if hasattr(job, key):
                    setattr(job, key, value)
            job.updated_at = time.time()
            return job

    def fail_job(self, job_id: str, error: str) -> Optional[TacticalJob]:
        return self.update_job(job_id, status="failed", error=error, message=error)

    def complete_job(self, job_id: str, result: Any, total_games: int = 0) -> Optional[TacticalJob]:
        return self.update_job(
            job_id,
            status="completed",
            progress_percent=100,
            stage="completed",
            message="완료",
            result=result,
            total_games=total_games,
            analyzed_games=total_games,
            error=None,
        )


tactical_job_store = TacticalJobStore()
