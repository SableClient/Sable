export type CallEmbedStartErrorKind = 'capability' | 'preparing';

export type CallEmbedStartError = {
  kind: CallEmbedStartErrorKind;
  message: string;
};

const defaultPreparingMessage = 'Could not prepare the call embed.';
const capabilityMessage = 'Call start was blocked by capability negotiation.';

export const toCallEmbedStartError = (error: unknown): CallEmbedStartError => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error == null
          ? ''
          : JSON.stringify(error);
  const normalized = rawMessage.toLowerCase();
  const looksLikeCapabilityError =
    normalized.includes('capabilit') || normalized.includes('org.matrix.msc');

  return {
    kind: looksLikeCapabilityError ? 'capability' : 'preparing',
    message: rawMessage || (looksLikeCapabilityError ? capabilityMessage : defaultPreparingMessage),
  };
};
