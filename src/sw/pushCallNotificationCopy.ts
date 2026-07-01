type CallNotificationType = 'ring' | 'notification';
type CallIntentKind = 'audio' | 'video';

export type CallNotificationCopyContext = {
  notificationType: CallNotificationType;
  intentKind: CallIntentKind;
  senderDisplayName?: string;
  roomName?: string;
  showPreviewDetails: boolean;
};

type CopyTemplate = {
  title: string | ((ctx: CallNotificationCopyContext) => string);
  body: string | ((ctx: CallNotificationCopyContext) => string | undefined);
};

type CopyRule = {
  when: (ctx: CallNotificationCopyContext) => boolean;
  template: CopyTemplate;
};

const firstMatchingTemplate = (
  ctx: CallNotificationCopyContext,
  rules: CopyRule[]
): CopyTemplate | undefined => {
  for (const rule of rules) {
    if (rule.when(ctx)) return rule.template;
  }
  return undefined;
};

const ROOM_CALL_RULES: CopyRule[] = [
  {
    when: (ctx) => !ctx.showPreviewDetails,
    template: { title: 'Room call started', body: 'Open Sable to join.' },
  },
  {
    when: (ctx) => Boolean(ctx.senderDisplayName && ctx.roomName),
    template: {
      title: 'Room call started',
      body: (ctx) => `${ctx.senderDisplayName} started a call in ${ctx.roomName}`,
    },
  },
  {
    when: (ctx) => Boolean(ctx.roomName),
    template: { title: 'Room call started', body: (ctx) => `A call started in ${ctx.roomName}` },
  },
  {
    when: (ctx) => Boolean(ctx.senderDisplayName),
    template: {
      title: 'Room call started',
      body: (ctx) => `${ctx.senderDisplayName} started a call`,
    },
  },
  {
    when: () => true,
    template: { title: 'Room call started', body: 'A room call started.' },
  },
];

const RING_CALL_RULES: CopyRule[] = [
  {
    when: (ctx) => !ctx.showPreviewDetails,
    template: {
      title: (ctx) => (ctx.intentKind === 'video' ? 'Incoming video call' : 'Incoming voice call'),
      body: 'Open Sable to answer.',
    },
  },
  {
    when: (ctx) => Boolean(ctx.senderDisplayName && ctx.roomName),
    template: {
      title: (ctx) => (ctx.intentKind === 'video' ? 'Incoming video call' : 'Incoming voice call'),
      body: (ctx) => `${ctx.senderDisplayName} is calling you in ${ctx.roomName}`,
    },
  },
  {
    when: (ctx) => Boolean(ctx.senderDisplayName),
    template: {
      title: (ctx) => (ctx.intentKind === 'video' ? 'Incoming video call' : 'Incoming voice call'),
      body: (ctx) => `${ctx.senderDisplayName} is calling you`,
    },
  },
  {
    when: (ctx) => Boolean(ctx.roomName),
    template: {
      title: (ctx) => (ctx.intentKind === 'video' ? 'Incoming video call' : 'Incoming voice call'),
      body: (ctx) => `Incoming call in ${ctx.roomName}`,
    },
  },
  {
    when: () => true,
    template: {
      title: (ctx) => (ctx.intentKind === 'video' ? 'Incoming video call' : 'Incoming voice call'),
      body: 'Incoming call',
    },
  },
];

export const resolveCallNotificationCopy = (
  ctx: CallNotificationCopyContext
): { title: string; body: string | undefined } => {
  const rules = ctx.notificationType === 'notification' ? ROOM_CALL_RULES : RING_CALL_RULES;
  const template = firstMatchingTemplate(ctx, rules);
  if (!template) {
    return { title: 'Incoming call', body: undefined };
  }

  return {
    title: typeof template.title === 'function' ? template.title(ctx) : template.title,
    body: typeof template.body === 'function' ? template.body(ctx) : template.body,
  };
};
