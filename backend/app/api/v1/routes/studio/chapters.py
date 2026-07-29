"""Chapter CRUD（从 projects.py 拆分）。"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import apply_keyword_filter, apply_order, paginate
from app.dependencies import get_db
from app.models.studio import Chapter, Project, Shot
from app.schemas.common import ApiResponse, PaginatedData, created_response, empty_response, paginated_response, success_response
from app.schemas.studio.shots import (
    ChapterCandidateAutoConfirmResultRead,
    ShotCandidateAutoConfirmRequest,
)
from app.services.common import (
    create_and_refresh,
    delete_if_exists,
    entity_already_exists,
    entity_not_found,
    ensure_not_exists,
    flush_and_refresh,
    get_or_404,
    patch_model,
    require_entity,
)
from app.schemas.studio.projects import (
    ChapterCanvasStateRead,
    ChapterCreate,
    ChapterRead,
    ChapterUpdate,
    ProjectCanvasStateUpdate,
    ProjectCanvasViewport,
)
from app.services.studio.candidate_auto_confirm import auto_confirm_chapter_candidates

router = APIRouter()

CHAPTER_ORDER_FIELDS = {"index", "title", "created_at", "updated_at", "storyboard_count", "status"}


def _json_value(value, fallback):  # noqa: ANN001, ANN202
    """兼容 MySQL JSON 字段在不同驱动下返回 str 或 Python 对象的差异。"""
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


@router.get(
    "",
    response_model=ApiResponse[PaginatedData[ChapterRead]],
    summary="章节列表（分页）",
)
async def list_chapters(
    db: AsyncSession = Depends(get_db),
    project_id: str | None = Query(None, description="按项目过滤"),
    q: str | None = Query(None, description="关键字，过滤 title/summary"),
    order: str | None = Query(None, description="排序字段"),
    is_desc: bool = Query(False, description="是否倒序"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
) -> ApiResponse[PaginatedData[ChapterRead]]:
    stmt = select(Chapter)
    if project_id:
        stmt = stmt.where(Chapter.project_id == project_id)
    stmt = apply_keyword_filter(stmt, q=q, fields=[Chapter.title, Chapter.summary])
    stmt = apply_order(
        stmt,
        model=Chapter,
        order=order,
        is_desc=is_desc,
        allow_fields=CHAPTER_ORDER_FIELDS,
        default="index",
    )
    items, total = await paginate(db, stmt=stmt, page=page, page_size=page_size)

    chapter_ids = [c.id for c in items]
    shot_count_by_chapter: dict[str, int] = {}
    if chapter_ids:
        count_stmt = (
            select(Shot.chapter_id, func.count(Shot.id))
            .where(Shot.chapter_id.in_(chapter_ids))
            .group_by(Shot.chapter_id)
        )
        res = await db.execute(count_stmt)
        shot_count_by_chapter = {str(ch_id): int(cnt) for ch_id, cnt in res.all()}

    return paginated_response(
        [
            ChapterRead.model_validate(x).model_copy(update={"shot_count": shot_count_by_chapter.get(x.id, 0)})
            for x in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post(
    "",
    response_model=ApiResponse[ChapterRead],
    status_code=status.HTTP_201_CREATED,
    summary="创建章节",
)
async def create_chapter(
    body: ChapterCreate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterRead]:
    await ensure_not_exists(
        db,
        Chapter,
        body.id,
        detail=entity_already_exists("Chapter"),
    )
    await require_entity(
        db,
        Project,
        body.project_id,
        detail=entity_not_found("Project"),
        status_code=400,
    )
    obj = await create_and_refresh(db, Chapter(**body.model_dump()))
    return created_response(ChapterRead.model_validate(obj))


@router.get(
    "/{chapter_id}",
    response_model=ApiResponse[ChapterRead],
    summary="获取章节",
)
async def get_chapter(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterRead]:
    obj = await get_or_404(db, Chapter, chapter_id, detail=entity_not_found("Chapter"))
    count_stmt = select(func.count(Shot.id)).where(Shot.chapter_id == chapter_id)
    res = await db.execute(count_stmt)
    shot_count = int(res.scalar() or 0)
    return success_response(ChapterRead.model_validate(obj).model_copy(update={"shot_count": shot_count}))


@router.get(
    "/{chapter_id}/canvas-state",
    response_model=ApiResponse[ChapterCanvasStateRead],
    summary="获取章节画布状态",
)
async def get_chapter_canvas_state(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterCanvasStateRead]:
    """读取章节级 React Flow 画布状态；没有保存记录时返回空画布默认值。"""
    chapter = await get_or_404(db, Chapter, chapter_id, detail=entity_not_found("Chapter"))
    result = await db.execute(
        text(
            """
            SELECT nodes, edges, viewport
            FROM chapter_canvas_states
            WHERE chapter_id = :chapter_id
            """
        ),
        {"chapter_id": chapter_id},
    )
    row = result.mappings().first()
    if not row:
        return success_response(ChapterCanvasStateRead(chapter_id=chapter_id, project_id=chapter.project_id))
    return success_response(
        ChapterCanvasStateRead(
            chapter_id=chapter_id,
            project_id=chapter.project_id,
            nodes=_json_value(row["nodes"], []),
            edges=_json_value(row["edges"], []),
            viewport=ProjectCanvasViewport.model_validate(_json_value(row["viewport"], {})),
        )
    )


@router.patch(
    "/{chapter_id}/canvas-state",
    response_model=ApiResponse[ChapterCanvasStateRead],
    summary="保存章节画布状态",
)
async def update_chapter_canvas_state(
    chapter_id: str,
    body: ProjectCanvasStateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterCanvasStateRead]:
    """按章节保存节点、连线与视口，保证一集一个画布刷新后可恢复。"""
    chapter = await get_or_404(db, Chapter, chapter_id, detail=entity_not_found("Chapter"))
    payload = body.model_dump(mode="json")
    await db.execute(
        text(
            """
            INSERT INTO chapter_canvas_states (chapter_id, project_id, nodes, edges, viewport)
            VALUES (:chapter_id, :project_id, CAST(:nodes AS JSON), CAST(:edges AS JSON), CAST(:viewport AS JSON))
            ON DUPLICATE KEY UPDATE
              project_id = VALUES(project_id),
              nodes = VALUES(nodes),
              edges = VALUES(edges),
              viewport = VALUES(viewport)
            """
        ),
        {
            "chapter_id": chapter_id,
            "project_id": chapter.project_id,
            "nodes": json.dumps(payload["nodes"], ensure_ascii=False),
            "edges": json.dumps(payload["edges"], ensure_ascii=False),
            "viewport": json.dumps(payload["viewport"], ensure_ascii=False),
        },
    )
    await db.commit()
    return success_response(ChapterCanvasStateRead(chapter_id=chapter_id, project_id=chapter.project_id, **payload))


@router.post(
    "/{chapter_id}/auto-confirm-candidates",
    response_model=ApiResponse[ChapterCandidateAutoConfirmResultRead],
    summary="章节级自动确认资产候选（串行去重，不调用 LLM）",
)
async def auto_confirm_chapter_candidates_api(
    chapter_id: str,
    body: ShotCandidateAutoConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterCandidateAutoConfirmResultRead]:
    data = await auto_confirm_chapter_candidates(db, chapter_id=chapter_id, level=body.level)
    return success_response(data)


@router.patch(
    "/{chapter_id}",
    response_model=ApiResponse[ChapterRead],
    summary="更新章节",
)
async def update_chapter(
    chapter_id: str,
    body: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[ChapterRead]:
    obj = await get_or_404(db, Chapter, chapter_id, detail=entity_not_found("Chapter"))
    update = body.model_dump(exclude_unset=True)
    if "project_id" in update:
        await require_entity(
            db,
            Project,
            update["project_id"],
            detail=entity_not_found("Project"),
            status_code=400,
        )
    patch_model(obj, update)
    await flush_and_refresh(db, obj)
    return success_response(ChapterRead.model_validate(obj))


@router.delete(
    "/{chapter_id}",
    response_model=ApiResponse[None],
    summary="删除章节",
)
async def delete_chapter(
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[None]:
    await delete_if_exists(db, Chapter, chapter_id)
    return empty_response()
