import { Descendant } from 'slate';
import {
  hasSettingsLinksToRewriteInDescendants,
  rewriteSettingsLinksInDescendants,
} from './settingsLinkMessage';

export type OutgoingMessageTransformContext = {
  isMarkdown: boolean;
  settingsLinkBaseUrl: string;
};

export type OutgoingMessageTransform = {
  apply: (children: Descendant[], context: OutgoingMessageTransformContext) => Descendant[];
  shouldApply: (children: Descendant[], context: OutgoingMessageTransformContext) => boolean;
};

export const outgoingMessageTransforms: OutgoingMessageTransform[] = [
  {
    apply: (children, context) =>
      rewriteSettingsLinksInDescendants(children, context.settingsLinkBaseUrl, context.isMarkdown),
    shouldApply: (children, context) =>
      hasSettingsLinksToRewriteInDescendants(
        children,
        context.settingsLinkBaseUrl,
        context.isMarkdown
      ),
  },
];
