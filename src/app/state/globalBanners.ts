import { atom, useSetAtom } from 'jotai';
import type { ComponentType, ReactNode } from 'react';
import { useEffect } from 'react';

export type GlobalBannerAction = {
  label: string;
  onClick: () => void;
  variant?: 'Primary' | 'Secondary' | 'Critical';
};

export type GlobalBanner = {
  id: string;
  icon?: ComponentType<{ size?: string | number; className?: string }>;
  title: string;
  description: ReactNode;
  primaryAction: GlobalBannerAction;
  secondaryAction?: GlobalBannerAction;
  priority?: number; // Higher priority renders first
};

export const globalBannersAtom = atom<GlobalBanner[]>([]);

export function useRegisterGlobalBanner(banner: GlobalBanner | null) {
  const setBanners = useSetAtom(globalBannersAtom);

  useEffect(() => {
    if (!banner) return undefined;

    setBanners((prev) => {
      if (prev.some((b) => b.id === banner.id)) {
        return prev.map((b) => (b.id === banner.id ? banner : b));
      }
      return [...prev, banner];
    });

    return () => {
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    };
  }, [banner, setBanners]);
}
