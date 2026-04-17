import type { PermissionLocation } from '$hooks/usePowerLevels';

export type PermissionItem = {
  location: PermissionLocation;
  name: string;
  description?: string;
};

export type PermissionGroup = {
  name: string;
  items: PermissionItem[];
};
