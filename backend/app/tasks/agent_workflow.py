from __future__ import annotations

import asyncio

from app.core.celery_app import celery_app
from app.core.db import close_db, reset_db_runtime
from app.services.studio.agent.auto_elements_chain import run_agent_auto_elements_chain


def enqueue_agent_auto_elements_chain(*, project_id: str, session_id: str, idempotency_key: str):
    return run_agent_auto_elements_chain_celery.delay(project_id, session_id, idempotency_key)


@celery_app.task(name="agent.auto_elements_chain")
def run_agent_auto_elements_chain_celery(project_id: str, session_id: str, idempotency_key: str) -> None:
    reset_db_runtime()
    asyncio.run(_run_with_db_runtime(project_id=project_id, session_id=session_id, idempotency_key=idempotency_key))


async def _run_with_db_runtime(*, project_id: str, session_id: str, idempotency_key: str) -> None:
    try:
        await run_agent_auto_elements_chain(
            project_id=project_id,
            session_id=session_id,
            idempotency_key=idempotency_key,
        )
    finally:
        await close_db()
