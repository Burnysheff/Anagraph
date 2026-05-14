from pydantic import BaseModel


class EntityType(BaseModel):
    name: str
    label: str
    color: str
    description: str = ""
    visible: bool = True
    is_default: bool = False
    position: int = 0


class EntityTypeCreate(BaseModel):
    name: str
    label: str | None = None
    description: str | None = None
    color: str | None = None


class EntityTypeUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None
    visible: bool | None = None
    position: int | None = None
