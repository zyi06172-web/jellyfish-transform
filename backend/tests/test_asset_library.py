from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.db import Base
from app.models.studio import (
    AssetQualityLevel,
    AssetViewAngle,
    Character,
    CharacterImage,
    FileItem,
    FileType,
    Project,
    ProjectPropLink,
    ProjectSceneLink,
    ProjectStyle,
    ProjectVisualStyle,
    Prop,
    PropImage,
    Scene,
    SceneImage,
)
from app.services.studio.asset_library import build_project_asset_library


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return session_local(), engine


@pytest.mark.asyncio
async def test_asset_library_returns_project_assets_with_bible_images_and_relations() -> None:
    db, engine = await _build_session()
    try:
        bible = {
            "schema_version": 1,
            "source": "prompt_synthesizer",
            "identity": "沈知夏，婚礼新娘。",
            "visual_anchors": {"eye_shape": "细长杏眼", "hairstyle": "黑色低盘发", "clothing": "白色婚纱"},
            "wearable_accessories": [{"name": "胸针", "placement": "胸前/胸口固定佩戴"}],
            "voice": "清冷克制的年轻女声",
        }
        project = Project(id="p1", name="婚礼短剧", style=ProjectStyle.real_people_city, visual_style=ProjectVisualStyle.live_action)
        character = Character(
            id="char-shen",
            project_id=project.id,
            name="沈知夏",
            description="新娘",
            bible_json=bible,
            style=project.style,
            visual_style=project.visual_style,
        )
        scene = Scene(id="scene-hall", name="婚礼大堂", description="暖金吊灯", style=project.style, visual_style=project.visual_style)
        prop = Prop(id="prop-bouquet", name="捧花", description="白玫瑰捧花", style=project.style, visual_style=project.visual_style)
        db.add_all([project, character, scene, prop])
        db.add_all(
            [
                ProjectSceneLink(project_id=project.id, scene_id=scene.id, chapter_id=None, shot_id=None),
                ProjectPropLink(project_id=project.id, prop_id=prop.id, chapter_id=None, shot_id=None),
            ]
        )
        db.add_all(
            [
                FileItem(id="file-char", type=FileType.image, name="沈知夏四视图", storage_key="generated/char.jpeg"),
                FileItem(id="file-scene", type=FileType.image, name="婚礼大堂", storage_key="generated/scene.jpeg"),
                FileItem(id="file-prop", type=FileType.image, name="捧花", storage_key="generated/prop.jpeg"),
            ]
        )
        db.add_all(
            [
                CharacterImage(
                    character_id=character.id,
                    file_id="file-char",
                    quality_level=AssetQualityLevel.low,
                    view_angle=AssetViewAngle.front,
                    is_primary=True,
                ),
                SceneImage(scene_id=scene.id, file_id="file-scene", quality_level=AssetQualityLevel.low, view_angle=AssetViewAngle.front),
                PropImage(prop_id=prop.id, file_id="file-prop", quality_level=AssetQualityLevel.low, view_angle=AssetViewAngle.front),
            ]
        )
        await db.commit()

        library = await build_project_asset_library(db, project_id=project.id)

        assert library.project_id == "p1"
        assert library.characters[0].name == "沈知夏"
        assert library.characters[0].bible["wearable_accessories"][0]["name"] == "胸针"
        assert library.characters[0].reference_images[0].url == "/api/v1/studio/files/file-char/download"
        assert library.scenes[0].name == "婚礼大堂"
        assert library.scenes[0].reference_images[0].url == "/api/v1/studio/files/file-scene/download"
        assert library.props[0].name == "捧花"
        assert library.props[0].reference_images[0].url == "/api/v1/studio/files/file-prop/download"
    finally:
        await db.close()
        await engine.dispose()
