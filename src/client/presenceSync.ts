import type { MatrixClient } from '$types/matrix-sdk';
import { ClientEvent, User, Method, Filter } from '$types/matrix-sdk';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('presenceSync');

export class PresenceSyncManager {
  private disposed = false;

  private enabled = true;

  private activeRequest: Promise<void> | null = null;

  private syncToken: string | undefined;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly pollTimeoutMs: number = 30000,
    private readonly pollingIntervalMs: number = 20000
  ) {
    debugLog.info('sync', 'PresenceSyncManager initialized');
  }

  public setPresenceEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled && !this.activeRequest && !this.disposed) {
      this.poll();
    }
  }

  public start(): void {
    if (this.disposed || this.activeRequest) return;
    this.poll();
  }

  public dispose(): void {
    this.disposed = true;
    this.enabled = false;
  }

  private async poll(): Promise<void> {
    if (!this.enabled || this.disposed) return;

    this.activeRequest = (async () => {
      try {
        const filter = new Filter(this.mx.getUserId());
        filter.setDefinition({
          room: { rooms: [] },
          account_data: { types: [] },
          presence: { types: ['m.presence'] },
        });

        const filterId = await this.mx.getOrCreateFilter('presence_only', filter);

        const response = (await this.mx.http.authedRequest(Method.Get, '/sync', {
          filter: filterId,
          since: this.syncToken,
          timeout: this.pollTimeoutMs,
          set_presence: this.enabled ? 'online' : 'offline',
        })) as Record<string, unknown>;

        debugLog.info('sync', 'PresenceSync response', {
          next_batch: response.next_batch,
          presence: response.presence,
        });

        this.syncToken = response.next_batch as string | undefined;

        const presence = response.presence as { events?: unknown[] } | undefined;

        if (presence?.events && Array.isArray(presence.events)) {
          const mapper = this.mx.getEventMapper();
          presence.events.forEach((rawEvent: unknown) => {
            if (
              typeof rawEvent !== 'object' ||
              !rawEvent ||
              (rawEvent as Record<string, unknown>).type !== 'm.presence'
            )
              return;
            const presenceEvent = mapper(rawEvent);

            const userId =
              presenceEvent.getSender() ??
              (presenceEvent.getContent().user_id as string | undefined);
            if (!userId) return;

            let user = this.mx.store.getUser(userId);
            if (user) {
              user.setPresenceEvent(presenceEvent);
            } else {
              user = User.createUser(userId, this.mx);
              user.setPresenceEvent(presenceEvent);
              this.mx.store.storeUser(user);
            }
            this.mx.emit(ClientEvent.Event, presenceEvent);
          });
        }
      } catch (err) {
        debugLog.error('sync', 'Error during background presence sync', err);
      }
    })();

    await this.activeRequest;
    this.activeRequest = null;

    if (this.enabled && !this.disposed) {
      // Sleep between polls to ensure it's very lightweight
      setTimeout(() => this.poll(), this.pollingIntervalMs);
    }
  }
}
