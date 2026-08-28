import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IContent } from 'matrix-js-sdk';
import type { IGalleryContent } from '$types/matrix/common';
import { MGallery } from './MGallery';

describe('MGallery', () => {
  it('does not crash when a received gallery omits itemtypes', () => {
    const renderItem = vi.fn<(content: IContent, index: number) => ReactNode>(() => null);

    expect(() =>
      render(
        <MGallery
          content={{ msgtype: 'dm.filament.gallery', body: 'Missing items' } as IGalleryContent}
          renderItem={renderItem}
        />
      )
    ).not.toThrow();

    expect(renderItem).not.toHaveBeenCalled();
  });
});
