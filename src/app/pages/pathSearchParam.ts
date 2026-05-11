import type { RoomSearchParams, DirectCreateSearchParams } from './paths';

type SearchParamsGetter<T> = (searchParams: URLSearchParams) => T;

export const getRoomSearchParams: SearchParamsGetter<RoomSearchParams> = (searchParams) => ({
  viaServers: searchParams.get('viaServers') ?? undefined,
});

export const getDirectCreateSearchParams: SearchParamsGetter<DirectCreateSearchParams> = (
  searchParams
) => ({
  userId: searchParams.get('userId') ?? undefined,
});
