import millifyPlugin from 'millify';
import { type MillifyOptions } from 'millify/dist/options';

export const millify = (count: number, options?: Partial<MillifyOptions>): string =>
  millifyPlugin(count, {
    precision: 1,
    locales: [],
    ...options,
  });
