import type { Descendant } from 'slate';
import { hasSettingsLinksToRewrite, rewriteSettingsLinks } from './settingsLinkMessage';

export type OutgoingMessageTransformContext = {
  settingsLinkBaseUrl: string;
};

export type OutgoingMessageTransform = {
  apply: (children: Descendant[], context: OutgoingMessageTransformContext) => Descendant[];
  shouldApply: (children: Descendant[], context: OutgoingMessageTransformContext) => boolean;
};

export const outgoingMessageTransforms: OutgoingMessageTransform[] = [
  {
    apply: (children, context) => rewriteSettingsLinks(children, context.settingsLinkBaseUrl),
    shouldApply: (children, context) =>
      hasSettingsLinksToRewrite(children, context.settingsLinkBaseUrl),
  },
];
