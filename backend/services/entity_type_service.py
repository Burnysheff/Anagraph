import re
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from models.entity_type import EntityType, EntityTypeCreate, EntityTypeUpdate


OTHER_TYPE_NAME = "Other"
OTHER_TYPE_COLOR = "#6c7086"
OTHER_TYPE_LABEL = "Другое"
OTHER_TYPE_DESCRIPTION = "не удалось определить тип"

PALETTE = [
    "#89b4fa", "#a6e3a1", "#fab387", "#cba6f7",
    "#f38ba8", "#9399b2", "#94e2d5", "#f5c2e7",
    "#74c7ec", "#b4befe", "#f9e2af", "#eba0ac",
    "#80aaff", "#cae0a0", "#ffc9a0", "#d0a5e8",
]

DEFAULT_TYPES: list[dict] = [
    {"name": "Person", "label": "Персона",
     "description": "конкретный человек (Ашиш Васвани, Джейкоб Девлин)",
     "color": "#89b4fa"},
    {"name": "Organization", "label": "Организация",
     "description": "компания, университет, лаборатория (Google, OpenAI, МФТИ)",
     "color": "#a6e3a1"},
    {"name": "Technology", "label": "Технология",
     "description": "модель, архитектура, фреймворк (BERT, Transformer, GPT-3)",
     "color": "#fab387"},
    {"name": "Concept", "label": "Концепция",
     "description": "метод, подход, область знания (attention mechanism, MLM, NLP)",
     "color": "#cba6f7"},
    {"name": "Location", "label": "Место",
     "description": "географическое место (Россия, Санкт-Петербург)",
     "color": "#f38ba8"},
    {"name": "Date", "label": "Дата",
     "description": "год или дата (2017, 2018)",
     "color": "#9399b2"},
    {"name": "Event", "label": "Событие",
     "description": "конференция, событие (NeurIPS 2017)",
     "color": "#94e2d5"},
    {"name": "Product", "label": "Продукт",
     "description": "конкретный продукт или версия (BERT-Base, BERT-Large)",
     "color": "#f5c2e7"},
]

_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
MAX_NAME_LEN = 50
MAX_LABEL_LEN = 80
MAX_DESCRIPTION_LEN = 500


class EntityTypeServiceError(ValueError):
    pass


def _row_to_type(row: aiosqlite.Row) -> EntityType:
    return EntityType(
        name=row["name"],
        label=row["label"],
        color=row["color"],
        description=row["description"],
        visible=bool(row["visible"]),
        is_default=bool(row["is_default"]),
        position=row["position"],
    )


def get_default_types() -> list[EntityType]:
    defaults = [
        EntityType(
            name=item["name"],
            label=item["label"],
            description=item["description"],
            color=item["color"],
            visible=True,
            is_default=True,
            position=idx,
        )
        for idx, item in enumerate(DEFAULT_TYPES)
    ]
    defaults.append(
        EntityType(
            name=OTHER_TYPE_NAME,
            label=OTHER_TYPE_LABEL,
            description=OTHER_TYPE_DESCRIPTION,
            color=OTHER_TYPE_COLOR,
            visible=True,
            is_default=True,
            position=len(DEFAULT_TYPES),
        )
    )
    return defaults


def _validate_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise EntityTypeServiceError("Name is required")
    if len(name) > MAX_NAME_LEN:
        raise EntityTypeServiceError(f"Name too long (max {MAX_NAME_LEN} chars)")
    if not _NAME_PATTERN.match(name):
        raise EntityTypeServiceError(
            "Name must start with a letter and contain only letters, digits, underscores"
        )
    return name


def _validate_color(color: str | None) -> str | None:
    if color is None:
        return None
    color = color.strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        raise EntityTypeServiceError("Color must be a hex string like #aabbcc")
    return color.lower()


def _validate_label(label: str | None, fallback: str) -> str:
    if label is None:
        return fallback
    label = label.strip()
    if not label:
        return fallback
    if len(label) > MAX_LABEL_LEN:
        raise EntityTypeServiceError(f"Label too long (max {MAX_LABEL_LEN} chars)")
    return label


def _validate_description(desc: str | None) -> str:
    if desc is None:
        return ""
    desc = desc.strip()
    if len(desc) > MAX_DESCRIPTION_LEN:
        raise EntityTypeServiceError(
            f"Description too long (max {MAX_DESCRIPTION_LEN} chars)"
        )
    return desc


class EntityTypeService:

    def __init__(self, db_path: str):
        self._db_path = db_path

    @asynccontextmanager
    async def _connect(self) -> AsyncIterator[aiosqlite.Connection]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            yield db

    async def get_all(self) -> list[EntityType]:
        async with self._connect() as db:
            async with db.execute(
                "SELECT name, label, color, description, visible, is_default, position "
                "FROM entity_types ORDER BY position ASC, name ASC"
            ) as cursor:
                rows = await cursor.fetchall()
        return [_row_to_type(r) for r in rows]

    async def get(self, name: str) -> EntityType | None:
        async with self._connect() as db:
            async with db.execute(
                "SELECT name, label, color, description, visible, is_default, position "
                "FROM entity_types WHERE name = ?",
                (name,),
            ) as cursor:
                row = await cursor.fetchone()
        return _row_to_type(row) if row else None

    async def ensure_initialized(self) -> None:
        async with self._connect() as db:
            async with db.execute("SELECT COUNT(*) AS c FROM entity_types") as cursor:
                row = await cursor.fetchone()
                count = row["c"] if row else 0
            if count == 0:
                await self._seed_defaults(db)
                await db.commit()

    async def _seed_defaults(self, db: aiosqlite.Connection) -> None:
        for et in get_default_types():
            await db.execute(
                "INSERT INTO entity_types "
                "(name, label, color, description, visible, is_default, position) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    et.name, et.label, et.color, et.description,
                    int(et.visible), int(et.is_default), et.position,
                ),
            )

    async def create(self, payload: EntityTypeCreate) -> EntityType:
        name = _validate_name(payload.name)
        if name == OTHER_TYPE_NAME:
            raise EntityTypeServiceError(f"'{OTHER_TYPE_NAME}' is reserved")
        color = _validate_color(payload.color)
        label = _validate_label(payload.label, name)
        description = _validate_description(payload.description)

        async with self._connect() as db:
            async with db.execute(
                "SELECT 1 FROM entity_types WHERE name = ?", (name,)
            ) as cursor:
                if await cursor.fetchone():
                    raise EntityTypeServiceError(f"Type '{name}' already exists")

            if color is None:
                color = await self._next_palette_color(db)

            async with db.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM entity_types"
            ) as cursor:
                row = await cursor.fetchone()
                next_pos = row["p"] if row else 0

            await db.execute(
                "INSERT INTO entity_types "
                "(name, label, color, description, visible, is_default, position) "
                "VALUES (?, ?, ?, ?, 1, 0, ?)",
                (name, label, color, description, next_pos),
            )
            await db.commit()

        return EntityType(
            name=name, label=label, color=color, description=description,
            visible=True, is_default=False, position=next_pos,
        )

    async def update(self, name: str, payload: EntityTypeUpdate) -> EntityType:
        existing = await self.get(name)
        if not existing:
            raise EntityTypeServiceError(f"Type '{name}' not found")

        new_label = existing.label
        if payload.label is not None:
            new_label = _validate_label(payload.label, existing.label)

        new_description = existing.description
        if payload.description is not None:
            new_description = _validate_description(payload.description)

        new_color = existing.color
        if payload.color is not None:
            validated = _validate_color(payload.color)
            if validated is not None:
                new_color = validated

        new_visible = existing.visible if payload.visible is None else payload.visible
        new_position = existing.position if payload.position is None else payload.position

        async with self._connect() as db:
            await db.execute(
                "UPDATE entity_types SET label = ?, color = ?, description = ?, "
                "visible = ?, position = ? WHERE name = ?",
                (new_label, new_color, new_description,
                 int(new_visible), new_position, name),
            )
            await db.commit()

        return EntityType(
            name=name, label=new_label, color=new_color,
            description=new_description, visible=new_visible,
            is_default=existing.is_default, position=new_position,
        )

    async def delete(self, name: str) -> None:
        if name == OTHER_TYPE_NAME:
            raise EntityTypeServiceError(f"'{OTHER_TYPE_NAME}' cannot be deleted")
        async with self._connect() as db:
            async with db.execute(
                "SELECT 1 FROM entity_types WHERE name = ?", (name,)
            ) as cursor:
                if not await cursor.fetchone():
                    raise EntityTypeServiceError(f"Type '{name}' not found")
            await db.execute("DELETE FROM entity_types WHERE name = ?", (name,))
            await db.commit()

    async def reset_to_defaults(self) -> list[EntityType]:
        async with self._connect() as db:
            await db.execute("DELETE FROM entity_types")
            await self._seed_defaults(db)
            await db.commit()
        return await self.get_all()

    async def _next_palette_color(self, db: aiosqlite.Connection) -> str:
        async with db.execute("SELECT color FROM entity_types") as cursor:
            used = {row["color"] for row in await cursor.fetchall()}
        for color in PALETTE:
            if color not in used:
                return color
        return PALETTE[len(used) % len(PALETTE)]
