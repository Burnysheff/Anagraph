from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_entity_type_service
from models.entity_type import EntityType, EntityTypeCreate, EntityTypeUpdate
from services.entity_type_service import (
    EntityTypeService,
    EntityTypeServiceError,
    get_default_types,
)

router = APIRouter()


@router.get("", response_model=list[EntityType])
async def list_types(service: EntityTypeService = Depends(get_entity_type_service)):
    return await service.get_all()


@router.get("/defaults", response_model=list[EntityType])
async def list_default_types():
    return get_default_types()


@router.post("", response_model=EntityType, status_code=201)
async def create_type(
    payload: EntityTypeCreate,
    service: EntityTypeService = Depends(get_entity_type_service),
):
    try:
        return await service.create(payload)
    except EntityTypeServiceError as e:
        raise HTTPException(400, str(e))


@router.patch("/{name}", response_model=EntityType)
async def update_type(
    name: str,
    payload: EntityTypeUpdate,
    service: EntityTypeService = Depends(get_entity_type_service),
):
    try:
        return await service.update(name, payload)
    except EntityTypeServiceError as e:
        raise HTTPException(400, str(e))


@router.delete("/{name}")
async def delete_type(
    name: str,
    service: EntityTypeService = Depends(get_entity_type_service),
):
    try:
        await service.delete(name)
    except EntityTypeServiceError as e:
        raise HTTPException(400, str(e))
    return {"status": "deleted"}


@router.post("/reset", response_model=list[EntityType])
async def reset_types(
    service: EntityTypeService = Depends(get_entity_type_service),
):
    return await service.reset_to_defaults()
