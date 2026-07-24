import { useAtomValue } from 'jotai';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Box, Button, Text } from 'folds';
import { sizedIcon } from '$components/icons/phosphor';
import { globalBannersAtom } from '$state/globalBanners';
import * as css from './GlobalBannerRenderer.css';

export function GlobalBannerRenderer() {
  const banners = useAtomValue(globalBannersAtom);
  const shouldReduceMotion = useReducedMotion();

  // Pick the highest priority banner (or oldest if equal priority)
  const activeBanner = banners.toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];

  return (
    <div className={css.Container}>
      <AnimatePresence mode="wait">
        {activeBanner && (
          <motion.div
            key={activeBanner.id}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -16, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 320 }}
            className={css.Banner}
            role="region"
            aria-label={activeBanner.title}
          >
            <div className={css.Header}>
              {activeBanner.icon && (
                <div className={css.IconContainer}>{sizedIcon(activeBanner.icon, '400')}</div>
              )}
              <div className={css.HeaderText}>
                <Text size="H4">{activeBanner.title}</Text>
                {typeof activeBanner.description === 'string' ? (
                  <Text size="T300" priority="300">
                    {activeBanner.description}
                  </Text>
                ) : (
                  activeBanner.description
                )}
              </div>
            </div>
            <Box className={css.Actions}>
              {activeBanner.secondaryAction && (
                <Button
                  variant={activeBanner.secondaryAction.variant ?? 'Secondary'}
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={activeBanner.secondaryAction.onClick}
                >
                  <Text size="B300">{activeBanner.secondaryAction.label}</Text>
                </Button>
              )}
              <Button
                variant={activeBanner.primaryAction.variant ?? 'Primary'}
                fill="Soft"
                outlined
                size="300"
                radii="300"
                onClick={activeBanner.primaryAction.onClick}
              >
                <Text size="B300">{activeBanner.primaryAction.label}</Text>
              </Button>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
