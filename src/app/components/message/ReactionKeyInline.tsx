import { useState } from 'react';
import { Icon, Icons, Text } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import { scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { mxcUrlToHttp } from '$utils/matrix';
import * as css from './Reaction.css';

type ReactionKeyInlineProps = {
  mx: MatrixClient;
  reactionKey?: string;
  shortcode?: string;
  useAuthentication?: boolean;
};

export function ReactionKeyInline({
  mx,
  reactionKey,
  shortcode,
  useAuthentication,
}: ReactionKeyInlineProps) {
  const [imgError, setImgError] = useState(false);

  if (!reactionKey) {
    if (shortcode) {
      return (
        <Text as="span" size="Inherit">
          :{shortcode}:
        </Text>
      );
    }
    return null;
  }

  if (reactionKey.startsWith('mxc://')) {
    if (imgError) {
      return (
        <span title="Failed to load emoji image" aria-label="Failed to load emoji image">
          <Icon size="100" src={Icons.Warning} style={{ opacity: 0.5 }} />
        </span>
      );
    }

    return (
      <img
        className={css.ReactionImg}
        src={mxcUrlToHttp(mx, reactionKey, useAuthentication) ?? reactionKey}
        alt={shortcode ?? 'reaction'}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <Text as="span" size="Inherit" style={{ unicodeBidi: 'plaintext' }}>
      {scaleSystemEmoji(reactionKey)}
    </Text>
  );
}
