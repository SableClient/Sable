import type { EditorDocument } from '$components/editor/model';
import { hasSettingsLinksToRewrite, rewriteSettingsLinks } from './settingsLinkMessage';

export type OutgoingMessageTransformContext = {
  settingsLinkBaseUrl: string;
};

export type OutgoingMessageTransform = {
  apply: (children: EditorDocument, context: OutgoingMessageTransformContext) => EditorDocument;
  shouldApply: (children: EditorDocument, context: OutgoingMessageTransformContext) => boolean;
};

export const outgoingMessageTransforms: OutgoingMessageTransform[] = [
  {
    apply: (children, context) => rewriteSettingsLinks(children, context.settingsLinkBaseUrl),
    shouldApply: (children, context) =>
      hasSettingsLinksToRewrite(children, context.settingsLinkBaseUrl),
  },
];
