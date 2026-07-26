"""项目资产库读视图服务。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    Character,
    CharacterImage,
    CharacterPropLink,
    ProjectPropLink,
    ProjectSceneLink,
    Prop,
    PropImage,
    Scene,
    SceneImage,
)
from app.schemas.studio.projects import (
    AssetLibraryItemRead,
    AssetLibraryReferenceImageRead,
    AssetLibraryRelationRead,
    ProjectAssetLibraryRead,
)
from app.services.studio.entity_thumbnails import download_url


async def build_project_asset_library(db: AsyncSession, *, project_id: str) -> ProjectAssetLibraryRead:
    """聚合同一 project 内可复用的角色、场景和道具资产。"""

    characters = await _character_items(db, project_id=project_id)
    scenes = await _scene_items(db, project_id=project_id)
    props = await _prop_items(db, project_id=project_id)
    return ProjectAssetLibraryRead(project_id=project_id, characters=characters, scenes=scenes, props=props)


async def _character_items(db: AsyncSession, *, project_id: str) -> list[AssetLibraryItemRead]:
    rows = (
        await db.execute(select(Character).where(Character.project_id == project_id).order_by(Character.name.asc()))
    ).scalars().all()
    image_map = await _images_by_parent(db, image_model=CharacterImage, parent_field_name="character_id", parent_ids=[row.id for row in rows])
    prop_relations = await _character_prop_relations(db, character_ids=[row.id for row in rows])
    return [
        AssetLibraryItemRead(
            id=row.id,
            type="character",
            name=row.name,
            description=row.description,
            bible=row.bible_json or {},
            reference_images=image_map.get(row.id, []),
            relations=prop_relations.get(row.id, []),
        )
        for row in rows
    ]


async def _scene_items(db: AsyncSession, *, project_id: str) -> list[AssetLibraryItemRead]:
    rows = (
        await db.execute(
            select(Scene)
            .join(ProjectSceneLink, ProjectSceneLink.scene_id == Scene.id)
            .where(ProjectSceneLink.project_id == project_id)
            .order_by(Scene.name.asc())
            .distinct()
        )
    ).scalars().all()
    image_map = await _images_by_parent(db, image_model=SceneImage, parent_field_name="scene_id", parent_ids=[row.id for row in rows])
    return [
        AssetLibraryItemRead(
            id=row.id,
            type="scene",
            name=row.name,
            description=row.description,
            bible={},
            reference_images=image_map.get(row.id, []),
            relations=[],
        )
        for row in rows
    ]


async def _prop_items(db: AsyncSession, *, project_id: str) -> list[AssetLibraryItemRead]:
    rows = (
        await db.execute(
            select(Prop)
            .join(ProjectPropLink, ProjectPropLink.prop_id == Prop.id)
            .where(ProjectPropLink.project_id == project_id)
            .order_by(Prop.name.asc())
            .distinct()
        )
    ).scalars().all()
    image_map = await _images_by_parent(db, image_model=PropImage, parent_field_name="prop_id", parent_ids=[row.id for row in rows])
    return [
        AssetLibraryItemRead(
            id=row.id,
            type="prop",
            name=row.name,
            description=row.description,
            bible={},
            reference_images=image_map.get(row.id, []),
            relations=[],
        )
        for row in rows
    ]


async def _images_by_parent(
    db: AsyncSession,
    *,
    image_model: type,
    parent_field_name: str,
    parent_ids: list[str],
) -> dict[str, list[AssetLibraryReferenceImageRead]]:
    if not parent_ids:
        return {}
    parent_field = getattr(image_model, parent_field_name)
    rows = (
        await db.execute(
            select(image_model)
            .where(parent_field.in_(parent_ids), image_model.file_id.is_not(None))
            .order_by(image_model.id.asc())
        )
    ).scalars().all()
    result: dict[str, list[AssetLibraryReferenceImageRead]] = {}
    for row in rows:
        parent_id = str(getattr(row, parent_field_name))
        file_id = str(row.file_id)
        result.setdefault(parent_id, []).append(
            AssetLibraryReferenceImageRead(
                image_id=int(row.id),
                file_id=file_id,
                url=download_url(file_id),
                view_angle=str(row.view_angle.value if hasattr(row.view_angle, "value") else row.view_angle),
                quality_level=str(row.quality_level.value if hasattr(row.quality_level, "value") else row.quality_level),
                is_primary=bool(getattr(row, "is_primary", False)),
            )
        )
    return result


async def _character_prop_relations(db: AsyncSession, *, character_ids: list[str]) -> dict[str, list[AssetLibraryRelationRead]]:
    if not character_ids:
        return {}
    rows = (
        await db.execute(
            select(CharacterPropLink)
            .where(CharacterPropLink.character_id.in_(character_ids))
            .order_by(CharacterPropLink.character_id.asc(), CharacterPropLink.index.asc())
        )
    ).scalars().all()
    result: dict[str, list[AssetLibraryRelationRead]] = {}
    for row in rows:
        result.setdefault(row.character_id, []).append(
            AssetLibraryRelationRead(
                relation_type="wears_or_uses",
                target_type="prop",
                target_id=row.prop_id,
                label=row.note or "",
            )
        )
    return result
