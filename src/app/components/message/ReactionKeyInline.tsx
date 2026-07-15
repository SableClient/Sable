import { useState } from 'react';
import { Text } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import { menuIcon, Warning } from '$components/icons/phosphor';
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
          {menuIcon(Warning, { style: { opacity: 0.5 } })}
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
