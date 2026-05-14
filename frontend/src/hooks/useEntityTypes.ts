import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEntityType,
  deleteEntityType,
  getEntityTypes,
  resetEntityTypes,
  updateEntityType,
} from "../api/client";
import type {
  EntityType,
  EntityTypeCreate,
  EntityTypeUpdate,
} from "../types";
import { ORPHAN_TYPE_COLOR } from "../types";

const QUERY_KEY = ["entity-types"];

export function useEntityTypes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getEntityTypes,
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (payload: EntityTypeCreate) => createEntityType(payload),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: EntityTypeUpdate }) =>
      updateEntityType(name, payload),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteEntityType(name),
    onSuccess: invalidate,
  });

  const resetMutation = useMutation({
    mutationFn: resetEntityTypes,
    onSuccess: invalidate,
  });

  const types = useMemo<EntityType[]>(() => query.data ?? [], [query.data]);

  const typesByName = useMemo(() => {
    const map = new Map<string, EntityType>();
    for (const t of types) map.set(t.name, t);
    return map;
  }, [types]);

  const getColor = useCallback(
    (name: string): string => typesByName.get(name)?.color ?? ORPHAN_TYPE_COLOR,
    [typesByName]
  );

  const getLabel = useCallback(
    (name: string): string => typesByName.get(name)?.label ?? name,
    [typesByName]
  );

  const isKnown = useCallback(
    (name: string): boolean => typesByName.has(name),
    [typesByName]
  );

  return {
    types,
    typesByName,
    isLoading: query.isLoading,
    error: query.error,
    getColor,
    getLabel,
    isKnown,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    reset: resetMutation.mutateAsync,
  };
}
