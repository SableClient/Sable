import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Icon, IconButton, Icons, Scroll } from 'folds';
import type { IContent } from 'matrix-js-sdk';
import type { IGalleryContent, IGalleryItem } from '$types/matrix/common';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '$hooks/useIntersectionObserver';
import * as css from './MGallery.css';

function galleryItemToContent(item: IGalleryItem): IContent {
  const { itemtype, ...rest } = item;
  return { ...rest, msgtype: itemtype } as IContent;
}

type MGalleryProps = {
  content: IGalleryContent;
  renderItem: (content: IContent, index: number) => ReactNode;
  renderCaption?: () => ReactNode;
};

export function MGallery({ content, renderItem, renderCaption }: MGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const backAnchorRef = useRef<HTMLDivElement>(null);
  const frontAnchorRef = useRef<HTMLDivElement>(null);
  const [backVisible, setBackVisible] = useState(true);
  const [frontVisible, setFrontVisible] = useState(true);

  const intersectionObserver = useIntersectionObserver(
    useCallback((entries) => {
      const backAnchor = backAnchorRef.current;
      const frontAnchor = frontAnchorRef.current;
      const backEntry = backAnchor && getIntersectionObserverEntry(backAnchor, entries);
      const frontEntry = frontAnchor && getIntersectionObserverEntry(frontAnchor, entries);
      if (backEntry) {
        setBackVisible(backEntry.isIntersecting);
      }
      if (frontEntry) {
        setFrontVisible(frontEntry.isIntersecting);
      }
    }, []),
    useCallback(
      () => ({
        root: scrollRef.current,
        rootMargin: '10px',
      }),
      []
    )
  );

  useEffect(() => {
    const backAnchor = backAnchorRef.current;
    const frontAnchor = frontAnchorRef.current;
    if (backAnchor) intersectionObserver?.observe(backAnchor);
    if (frontAnchor) intersectionObserver?.observe(frontAnchor);
    return () => {
      if (backAnchor) intersectionObserver?.unobserve(backAnchor);
      if (frontAnchor) intersectionObserver?.unobserve(frontAnchor);
    };
  }, [intersectionObserver]);

  const handleScrollBack = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft - offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };
  const handleScrollFront = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft + offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };

  const items = content.itemtypes;

  return (
    <Box direction="Column">
      <Box className={css.GalleryHolder} direction="Column" style={{ position: 'relative' }}>
        <Scroll ref={scrollRef} direction="Horizontal" size="0" visibility="Hover" hideTrack>
          <Box shrink="No" alignItems="Center">
            <div ref={backAnchorRef} />
            {!backVisible && (
              <>
                <div className={css.GalleryHolderGradient({ position: 'Left' })} />
                <IconButton
                  className={css.GalleryHolderBtn({ position: 'Left' })}
                  variant="Secondary"
                  radii="Pill"
                  size="300"
                  outlined
                  onClick={handleScrollBack}
                >
                  <Icon size="300" src={Icons.ArrowLeft} />
                </IconButton>
              </>
            )}
            <Box alignItems="Inherit" gap="200">
              {items.map((item, index) => (
                <div key={item.url ?? item.file?.url ?? index} className={css.GalleryItem}>
                  {renderItem(galleryItemToContent(item), index)}
                </div>
              ))}
              {!frontVisible && (
                <>
                  <div className={css.GalleryHolderGradient({ position: 'Right' })} />
                  <IconButton
                    className={css.GalleryHolderBtn({ position: 'Right' })}
                    variant="Primary"
                    radii="Pill"
                    size="300"
                    outlined
                    onClick={handleScrollFront}
                  >
                    <Icon size="300" src={Icons.ArrowRight} />
                  </IconButton>
                </>
              )}
              <div ref={frontAnchorRef} />
            </Box>
          </Box>
        </Scroll>
      </Box>
      {renderCaption?.()}
    </Box>
  );
}
