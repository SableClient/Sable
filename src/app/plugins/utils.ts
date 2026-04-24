import type { SearchItemStrGetter } from '$hooks/useAsyncSearch';
import { PackImageReader } from './custom-emoji';
import type { IEmoji } from './emoji';

export const getEmoticonSearchStr: SearchItemStrGetter<PackImageReader | IEmoji> = (item) => {
  const shortcode = `:${item.shortcode}:`;
  if (item instanceof PackImageReader) {
    if (item.body) {
      return [shortcode, item.body];
    }
    return shortcode;
  }

  const names = [shortcode, item.label];
  if (Array.isArray(item.shortcodes)) {
    return names.concat(item.shortcodes);
  }
  return names;
};
