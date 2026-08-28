import { useAtomValue } from 'jotai';
import { Box, Button, Text } from 'folds';
import { sizedIcon } from '$components/icons/phosphor';
import { globalBannersAtom } from '$state/globalBanners';
import { useNativePresence } from '$hooks/useNativePresence';
import * as css from './GlobalBannerRenderer.css';

export function GlobalBannerRenderer() {
  const banners = useAtomValue(globalBannersAtom);

  // Pick the highest priority banner (or oldest if equal priority)
  const activeBanner = banners.toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  const { displayed: renderedBanner, phase } = useNativePresence(
    activeBanner,
    activeBanner?.id,
    150
  );

  return (
    <div className={css.Container}>
      {renderedBanner && (
        <div
          key={renderedBanner.id}
          className={`${css.Banner} ${phase === 'exit' ? css.BannerExit : css.BannerEnter}`}
          role="region"
          aria-label={renderedBanner.title}
        >
          <div className={css.Header}>
            {renderedBanner.icon && (
              <div className={css.IconContainer}>{sizedIcon(renderedBanner.icon, '400')}</div>
            )}
            <div className={css.HeaderText}>
              <Text size="H4">{renderedBanner.title}</Text>
              {typeof renderedBanner.description === 'string' ? (
                <Text size="T300" priority="300">
                  {renderedBanner.description}
                </Text>
              ) : (
                renderedBanner.description
              )}
            </div>
          </div>
          <Box className={css.Actions}>
            {renderedBanner.secondaryAction && (
              <Button
                variant={renderedBanner.secondaryAction.variant ?? 'Secondary'}
                fill="Soft"
                outlined
                size="300"
                radii="300"
                onClick={renderedBanner.secondaryAction.onClick}
              >
                <Text size="B300">{renderedBanner.secondaryAction.label}</Text>
              </Button>
            )}
            <Button
              variant={renderedBanner.primaryAction.variant ?? 'Primary'}
              fill="Soft"
              outlined
              size="300"
              radii="300"
              onClick={renderedBanner.primaryAction.onClick}
            >
              <Text size="B300">{renderedBanner.primaryAction.label}</Text>
            </Button>
          </Box>
        </div>
      )}
    </div>
  );
}
