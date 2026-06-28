import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { ClientEvent, KnownMembership, MatrixEventEvent, RoomStateEvent } from '$types/matrix-sdk';
import type { IRoomEvent, IWidget, WidgetDriver } from 'matrix-widget-api';
import {
  ClientWidgetApi,
  type IWidgetApiRequest,
  Widget,
  WidgetApiFromWidgetAction,
  WidgetApiToWidgetAction,
} from 'matrix-widget-api';
import { CallWidgetDriver } from './CallWidgetDriver';
import { trimTrailingSlash } from '../../utils/common';
import type { ElementCallThemeKind, ElementMediaStateDetail } from './types';
import { color, config } from 'folds';
import { ElementCallIntent, ElementWidgetActions } from './types';
import { CallControl } from './CallControl';
import { CallControlState } from './CallControlState';
import { createDebugLogger } from '../../utils/debugLogger';

const debugLog = createDebugLogger('CallEmbed');

const resolveCssVar = (variable: string): string => {
  const match = variable.match(/var\((--[^,)]+)/);
  if (match && match[1]) {
    const bodyVal = window.getComputedStyle(document.body).getPropertyValue(match[1]).trim();
    if (bodyVal) return bodyVal;
    const docElVal = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(match[1])
      .trim();
    if (docElVal) return docElVal;
  }
  return variable;
};

export class CallEmbed {
  private mx: MatrixClient;

  public readonly call: ClientWidgetApi;

  public readonly iframe: HTMLIFrameElement;

  public readonly room: Room;

  public joined = false;

  public readonly control: CallControl;

  private readonly container: HTMLElement;

  private readUpToMap: Record<string, string> = {}; // room ID to event ID

  private eventsToFeed = new WeakSet<MatrixEvent>();

  private readonly disposables: Array<() => void> = [];

  static getIntent(dm: boolean, ongoing: boolean, video: boolean | undefined): ElementCallIntent {
    if (ongoing) {
      if (dm) {
        return video ? ElementCallIntent.JoinExistingDM : ElementCallIntent.JoinExistingDMVoice;
      }
      return video ? ElementCallIntent.JoinExisting : ElementCallIntent.JoinExistingVoice;
    }

    if (dm) {
      return video ? ElementCallIntent.StartCallDM : ElementCallIntent.StartCallDMVoice;
    }

    return video ? ElementCallIntent.StartCall : ElementCallIntent.StartCallVoice;
  }

  static dmCall(intent: ElementCallIntent): boolean {
    return (
      intent === ElementCallIntent.JoinExistingDM ||
      intent === ElementCallIntent.JoinExistingDMVoice ||
      intent === ElementCallIntent.StartCallDM ||
      intent === ElementCallIntent.StartCallDMVoice
    );
  }

  static startingCall(intent: ElementCallIntent): boolean {
    return (
      intent === ElementCallIntent.StartCallDM ||
      intent === ElementCallIntent.StartCallDMVoice ||
      intent === ElementCallIntent.StartCall ||
      intent === ElementCallIntent.StartCallVoice
    );
  }

  static getWidget(
    mx: MatrixClient,
    room: Room,
    intent: ElementCallIntent,
    themeKind: ElementCallThemeKind,
    elementCallUrl?: string
  ): Widget {
    const userId = mx.getSafeUserId();
    const deviceId = mx.getDeviceId() ?? '';
    const clientOrigin = window.location.origin;
    const widgetId = 'call-embed';

    const params = new URLSearchParams({
      widgetId,
      parentUrl: clientOrigin,
      baseUrl: mx.baseUrl,
      roomId: room.roomId,
      userId,
      deviceId,
      intent,

      skipLobby: 'true',
      confineToRoom: 'true',
      appPrompt: 'false',
      perParticipantE2EE: room.hasEncryptionStateEvent().toString(),
      lang: 'en-EN',
      theme: themeKind,
      header: 'none',
    });

    if (!room.isCallRoom() && CallEmbed.startingCall(intent)) {
      params.append('sendNotificationType', CallEmbed.dmCall(intent) ? 'ring' : 'notification');
      params.append('waitForCallPickup', 'false');
    }

    let widgetUrl: URL;
    if (elementCallUrl && elementCallUrl.trim()) {
      try {
        widgetUrl = new URL(elementCallUrl, window.location.origin);
      } catch (error) {
        debugLog.warn(
          'call',
          'Invalid elementCallUrl in client config, falling back to bundled call app',
          {
            elementCallUrl,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        widgetUrl = new URL(
          `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/element-call/index.html`,
          window.location.origin
        );
      }
    } else {
      widgetUrl = new URL(
        `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/element-call/index.html`,
        window.location.origin
      );
    }
    widgetUrl.search = params.toString();

    const options: IWidget = {
      id: widgetId,
      creatorUserId: userId,
      name: 'Call',
      type: 'm.call',
      url: widgetUrl.href,
      waitForIframeLoad: false,
      data: {},
    };

    const widget: Widget = new Widget(options);

    return widget;
  }

  static getIframe(url: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe');

    iframe.title = 'Call Embed';
    iframe.sandbox =
      'allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads';
    iframe.allow = 'microphone; camera; display-capture; autoplay; clipboard-write;';
    iframe.src = url;

    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    return iframe;
  }

  constructor(
    mx: MatrixClient,
    room: Room,
    widget: Widget,
    container: HTMLElement,
    initialControlState?: CallControlState
  ) {
    debugLog.info('call', 'Initializing call embed', { roomId: room.roomId });

    const iframe = CallEmbed.getIframe(
      widget.getCompleteUrl({ currentUserId: mx.getSafeUserId() })
    );
    container.append(iframe);

    const callWidgetDriver: WidgetDriver = new CallWidgetDriver(mx, room.roomId);
    const call: ClientWidgetApi = new ClientWidgetApi(widget, iframe, callWidgetDriver);

    this.mx = mx;
    this.call = call;
    this.room = room;
    this.iframe = iframe;
    this.container = container;

    const controlState = initialControlState ?? new CallControlState(true, false, true);
    this.control = new CallControl(controlState, call, iframe);

    this.disposables.push(
      this.listenAction(WidgetApiFromWidgetAction.UpdateAlwaysOnScreen, (evt) => {
        evt.preventDefault();
        this.call.transport.reply(evt.detail as IWidgetApiRequest, {
          success: true,
        });
      })
    );
    this.disposables.push(
      this.listenAction(ElementWidgetActions.Close, (evt) => {
        evt.preventDefault();
        this.call.transport.reply(evt.detail as IWidgetApiRequest, {});
      })
    );

    let initialMediaEvent = true;
    this.disposables.push(
      this.listenAction(ElementWidgetActions.DeviceMute, (evt) => {
        evt.preventDefault();
        this.call.transport.reply(evt.detail as IWidgetApiRequest, {});
        if (initialMediaEvent) {
          initialMediaEvent = false;
          this.control.applyState();
          return;
        }
        this.control.onMediaState(evt as CustomEvent<ElementMediaStateDetail>);
      })
    );

    this.start();
  }

  get roomId(): string {
    return this.room.roomId;
  }

  get document(): Document | undefined {
    return this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
  }

  public setTheme(theme: ElementCallThemeKind) {
    return this.call.transport.send(WidgetApiToWidgetAction.ThemeChange, {
      name: theme,
    });
  }

  public hangup() {
    debugLog.info('call', 'Hanging up call', { roomId: this.roomId });
    return this.call.transport.send(ElementWidgetActions.HangupCall, {});
  }

  public onPreparing(callback: () => void) {
    return this.listenEvent('preparing', callback);
  }

  public onPreparingError(callback: (error: unknown) => void) {
    return this.listenEvent('error:preparing', callback);
  }

  public onReady(callback: () => void) {
    return this.listenEvent('ready', callback);
  }

  public onCapabilitiesNotified(callback: () => void) {
    return this.listenEvent('capabilitiesNotified', callback);
  }

  private start() {
    debugLog.info('call', 'Starting call widget', { roomId: this.roomId });
    // Room widgets get locked to the room they were added in
    this.call.setViewedRoomId(this.roomId);
    this.disposables.push(
      this.listenAction(ElementWidgetActions.JoinCall, this.onCallJoined.bind(this))
    );

    // Populate the map of "read up to" events for this widget with the current event in every room.
    // This is a bit inefficient, but should be okay. We do this for all rooms in case the widget
    // requests timeline capabilities in other rooms down the road. It's just easier to manage here.
    this.mx.getRooms().forEach((room) => {
      // Timelines are most recent last
      const events = room.getLiveTimeline()?.getEvents() || [];
      const roomEvent = events[events.length - 1];
      if (!roomEvent) return; // force later code to think the room is fresh
      this.readUpToMap[room.roomId] = roomEvent.getId()!;
    });

    // Bind handlers once and route removal through `disposables` so listeners can be
    // cleanly torn down when the embed is recreated.
    const boundOnEvent = this.onEvent.bind(this);
    const boundOnEventDecrypted = this.onEventDecrypted.bind(this);
    const boundOnStateUpdate = this.onStateUpdate.bind(this);
    const boundOnToDeviceEvent = this.onToDeviceEvent.bind(this);
    this.mx.on(ClientEvent.Event, boundOnEvent);
    this.mx.on(MatrixEventEvent.Decrypted, boundOnEventDecrypted);
    this.mx.on(RoomStateEvent.Events, boundOnStateUpdate);
    this.mx.on(ClientEvent.ToDeviceEvent, boundOnToDeviceEvent);
    this.disposables.push(() => {
      this.mx.off(ClientEvent.Event, boundOnEvent);
      this.mx.off(MatrixEventEvent.Decrypted, boundOnEventDecrypted);
      this.mx.off(RoomStateEvent.Events, boundOnStateUpdate);
      this.mx.off(ClientEvent.ToDeviceEvent, boundOnToDeviceEvent);
    });
  }

  /**
   * Stops the widget messaging for if it is started. Skips stopping if it is an active
   * widget.
   * @param opts
   */
  public dispose(): void {
    debugLog.info('call', 'Disposing call widget', { roomId: this.roomId });
    this.disposables.forEach((disposable) => {
      disposable();
    });
    this.call.stop();
    this.container.removeChild(this.iframe);
    this.control.dispose();

    // Listener removal is handled by the disposables pushed in start().
    // Clear internal state
    this.readUpToMap = {};
    this.eventsToFeed = new WeakSet<MatrixEvent>();
  }

  private onCallJoined(evt: CustomEvent): void {
    evt.preventDefault();
    this.call.transport.reply(evt.detail as IWidgetApiRequest, {});
    debugLog.info('call', 'Call joined', { roomId: this.roomId });
    this.joined = true;
    this.applyStyles();
    this.control.startObserving();
  }

  private applyStyles(): void {
    const doc = this.document;
    if (!doc) return;

    doc.body.style.setProperty('background', 'none', 'important');

    // Copy stylesheets from parent just in case
    const syncStyles = () => {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          if (!sheet.href || sheet.href.startsWith(window.location.origin)) {
            const rules = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join('\\n');
            if (rules && !doc.head.innerHTML.includes(rules.substring(0, 50))) {
              const styleEl = doc.createElement('style');
              styleEl.textContent = rules;
              doc.head.append(styleEl);
            }
          } else if (sheet.href) {
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            doc.head.append(link);
          }
        } catch {
          // Ignore CORS errors
        }
      });
    };
    syncStyles();

    const updateInjectedCSS = () => {
      const styleId = 'sable-call-embed-styles';
      let styleEl = doc.getElementById(styleId);
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = styleId;
        doc.head.append(styleEl);
      }

      const appFontFamily = window.getComputedStyle(document.body).fontFamily;

      styleEl.textContent = `
        :root {
          /* Backgrounds */
          --cpd-color-bg-canvas-default: ${resolveCssVar(color.Background.Container)} !important;
          --cpd-color-bg-canvas-solid: ${resolveCssVar(color.Background.Container)} !important;
          --cpd-color-bg-surface-default: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          --cpd-color-bg-surface-solid: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          --cpd-color-bg-surface-raised: ${resolveCssVar(color.Surface.Container)} !important;
          
          /* Soft Fills for normal buttons */
          --cpd-color-bg-subtle-primary: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          --cpd-color-bg-subtle-secondary: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          --cpd-color-bg-action-secondary-rest: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          --cpd-color-bg-action-secondary-hovered: ${resolveCssVar(color.SurfaceVariant.ContainerHover)} !important;
          --cpd-color-bg-action-secondary-pressed: ${resolveCssVar(color.SurfaceVariant.ContainerActive)} !important;

          --cpd-color-bg-action-tertiary-rest: transparent !important;
          --cpd-color-bg-action-tertiary-hovered: ${resolveCssVar(color.SurfaceVariant.ContainerHover)} !important;
          --cpd-color-bg-action-tertiary-pressed: ${resolveCssVar(color.SurfaceVariant.ContainerActive)} !important;
          
          /* Soft Fills for primary/active buttons */
          --cpd-color-bg-action-primary-rest: ${resolveCssVar(color.Primary.Container)} !important;
          --cpd-color-bg-action-primary-hovered: ${resolveCssVar(color.Primary.ContainerHover)} !important;
          --cpd-color-bg-action-primary-pressed: ${resolveCssVar(color.Primary.ContainerActive)} !important;
          
          /* Soft Fills for critical buttons (Hangup) */
          --cpd-color-bg-critical-primary: ${resolveCssVar(color.Critical.Container)} !important;
          --cpd-color-bg-action-critical-rest: ${resolveCssVar(color.Critical.Container)} !important;
          --cpd-color-bg-action-critical-hovered: ${resolveCssVar(color.Critical.ContainerHover)} !important;
          --cpd-color-bg-action-critical-pressed: ${resolveCssVar(color.Critical.ContainerActive)} !important;
          
          /* Borders */
          --cpd-color-border-interactive-primary: ${resolveCssVar(color.Primary.Main)} !important;
          --cpd-color-border-interactive-secondary: ${resolveCssVar(color.Surface.ContainerLine)} !important;
          --cpd-color-border-focused: ${resolveCssVar(color.Primary.Main)} !important;

          /* Typography and Icons */
          --cpd-font-family-sans: "Nunito Variable", sans-serif !important;
          --cpd-color-text-primary: ${resolveCssVar(color.Background.OnContainer)} !important;
          --cpd-color-text-secondary: ${resolveCssVar(color.Surface.OnContainer)} !important;
          --cpd-color-icon-primary: ${resolveCssVar(color.Background.OnContainer)} !important;
          --cpd-color-icon-secondary: ${resolveCssVar(color.Surface.OnContainer)} !important;
          --cpd-color-icon-tertiary: ${resolveCssVar(color.SurfaceVariant.OnContainer)} !important;
          
          /* Icons/Text on Soft Fill Backgrounds */
          --cpd-color-icon-on-solid-primary: ${resolveCssVar(color.Primary.OnContainer)} !important;
          --cpd-color-text-on-solid-primary: ${resolveCssVar(color.Primary.OnContainer)} !important;
          --cpd-color-icon-critical-primary: ${resolveCssVar(color.Critical.OnContainer)} !important;
          --cpd-color-text-critical-primary: ${resolveCssVar(color.Critical.OnContainer)} !important;
        }

        /* Enforce rounded rectangles instead of circles */
        [class*="button_"], [class*="Button_"], button {
          border-radius: ${resolveCssVar(config.radii.R400)} !important;
        }

        /* Make the main room background mimic standard DM call appearance */
        [class*="_inRoom_"], body {
          background: ${resolveCssVar(color.Background.Container)} !important;
        }
        
        /* Completely dismantle Element Call's grouping pills to match Sable's discrete buttons */
        [data-testid="footer-container"] [class*="_container_"] {
          background-color: transparent !important;
          border: none !important;
          gap: ${resolveCssVar(config.space.S100)} !important;
        }
        
        /* Ensure primary/muted buttons maintain a solid border by applying to both the element and its background overlays */
        [class*="button_"][data-kind="primary"], [class*="Button_"][data-kind="primary"], button[data-kind="primary"],
        [class*="button_"][data-kind="primary"]::before, [class*="Button_"][data-kind="primary"]::before, button[data-kind="primary"]::before,
        [class*="button_"][data-kind="primary"]::after, [class*="Button_"][data-kind="primary"]::after, button[data-kind="primary"]::after {
          border: 1px solid ${resolveCssVar(color.Primary.ContainerLine)} !important;
          box-sizing: border-box !important;
        }
        [class*="button_"][data-kind="primary"][class*="_destructive_"],
        [class*="button_"][data-kind="primary"][class*="_destructive_"]::before,
        [class*="button_"][data-kind="primary"][class*="_destructive_"]::after {
          border: 1px solid ${resolveCssVar(color.Critical.ContainerLine)} !important;
          box-sizing: border-box !important;
        }
        
        /* Fix secondary buttons inside the footer to have Sable's exact container styling */
        [data-testid="footer-container"] button[data-kind="secondary"],
        [data-testid="footer-container"] button[aria-haspopup="menu"] {
          background: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          border: 1px solid ${resolveCssVar(color.Surface.ContainerLine)} !important;
          color: var(--cpd-color-icon-secondary) !important;
        }
        
        /* Disable Compound's hover backgrounds on the pseudo-elements for these buttons so our background shows through */
        [data-testid="footer-container"] button[data-kind="secondary"]::before,
        [data-testid="footer-container"] button[aria-haspopup="menu"]::before {
          background: none !important;
        }

        [data-testid="footer-container"] button[data-kind="secondary"]:hover,
        [data-testid="footer-container"] button[aria-haspopup="menu"]:hover {
          background: ${resolveCssVar(color.SurfaceVariant.ContainerHover)} !important;
        }
        
        [class*="button_"]::before, [class*="Button_"]::before, button::before,
        [class*="button_"]::after, [class*="Button_"]::after, button::after,
        [data-testid="footer-container"] [class*="_container_"]::before,
        [data-testid="footer-container"] [class*="_container_"]::after {
          border-radius: inherit !important;
        }
        
        /* Tile styling */
        [class*="_tile_"] {
          border-radius: ${resolveCssVar(config.radii.R500)} !important;
        }

        [class*="_tile_"][class*="_speaking_"]::before {
          background: ${resolveCssVar(color.Primary.Main)} !important;
          opacity: 0.8 !important;
        }

        /* Avatar background */
        [class*="_tile_"] > [class*="_bg_"] {
          background-color: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
        }
        
        /* Remove the dark gradient overlay from the tile foreground */
        [class*="_fg_"] {
          background: none !important;
        }
        
        /* Ensure the options button in the tile remains visible without the gradient */
        [class*="_fg_"] button {
          background-color: ${resolveCssVar(color.Surface.Container)} !important;
          border: 1px solid ${resolveCssVar(color.Surface.ContainerLine)} !important;
          color: ${resolveCssVar(color.Surface.OnContainer)} !important;
        }
        [class*="_fg_"] button:hover {
          background-color: ${resolveCssVar(color.Surface.ContainerHover)} !important;
        }

        /* Nametag styling */
        [class*="_nameTag_"] {
          background-color: ${resolveCssVar(color.Surface.Container)} !important;
          border: 1px solid ${resolveCssVar(color.Surface.ContainerLine)} !important;
          color: ${resolveCssVar(color.Surface.OnContainer)} !important;
          border-radius: ${resolveCssVar(config.radii.R300)} !important;
        }

        /* Settings 3-dots button overrides */
        [data-testid="settings-bottom-left"] {
          --cpd-icon-button-size: 48px !important;
          background-color: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          border-radius: ${resolveCssVar(config.radii.R400)} !important;
        }

        /* Layout switcher overrides */
        fieldset[class*="_toggle_"] {
          background-color: ${resolveCssVar(color.SurfaceVariant.Container)} !important;
          border: 1px solid ${resolveCssVar(color.Surface.ContainerLine)} !important;
          border-radius: ${resolveCssVar(config.radii.R400)} !important;
        }
        fieldset[class*="_toggle_"] input:checked + svg {
          background-color: ${resolveCssVar(color.Primary.Container)} !important;
          color: ${resolveCssVar(color.Primary.OnContainer)} !important;
          border-radius: ${resolveCssVar(config.radii.R300)} !important;
        }

        /* Overlay styling */
        [class*="_overlay_"] {
          background-color: var(--cpd-color-bg-canvas-default) !important;
        }

        /* Slider overrides */
        [role="slider"], [class*="handle"] {
          background-color: ${resolveCssVar(color.Primary.Main)} !important;
          box-shadow: 0 0 0 2px ${resolveCssVar(color.Surface.Container)} !important;
        }
        [class*="highlight"] {
          background-color: ${resolveCssVar(color.Primary.Main)} !important;
        }
        [class*="track"] {
          background-color: ${resolveCssVar(color.SurfaceVariant.ContainerHover)} !important;
          outline: none !important;
        }

        /* Tooltips and Menus */
        [role="tooltip"], .cpd-tooltip, [data-radix-popper-content-wrapper] > div, div[class*="_tooltip_"] {
          background-color: ${resolveCssVar(color.Surface.Container)} !important;
          color: ${resolveCssVar(color.Surface.OnContainer)} !important;
          border: 1px solid ${resolveCssVar(color.Surface.ContainerLine)} !important;
          border-radius: ${resolveCssVar(config.radii.R400)} !important;
          padding: ${resolveCssVar(config.space.S200)} ${resolveCssVar(config.space.S300)} !important;
          font-size: ${resolveCssVar(config.fontSize.B300)} !important;
          box-shadow: 0 4px 6px ${resolveCssVar(color.Other.Shadow)} !important;
        }
        
        /* Ensure tooltip text inside wrapper inherits correctly */
        [role="tooltip"] *, .cpd-tooltip *, [data-radix-popper-content-wrapper] * {
          color: inherit !important;
        }
        /* Use parent app's font for emojis/reactions */
        [class*="reaction" i], [class*="emoji" i], [class*="reaction" i] * {
          font-family: ${appFontFamily} !important;
        }
      `;
    };

    // Sync theme classes from parent html/body
    const syncThemeClasses = () => {
      doc.documentElement.className = document.documentElement.className;
      doc.body.className = document.body.className;

      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) doc.documentElement.setAttribute('data-theme', theme);

      // Re-evaluate vars and update CSS on theme change
      updateInjectedCSS();
    };

    // Initial injection
    syncThemeClasses();

    const observer = new MutationObserver(syncThemeClasses);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    this.disposables.push(() => observer.disconnect());
  }

  private onEvent(ev: MatrixEvent): void {
    this.mx.decryptEventIfNeeded(ev);
    this.feedEvent(ev);
  }

  private onEventDecrypted(ev: MatrixEvent): void {
    this.feedEvent(ev);
  }

  private onStateUpdate(ev: MatrixEvent): void {
    if (this.call === null) return;
    const raw = ev.getEffectiveEvent();
    this.call.feedStateUpdate(raw as IRoomEvent).catch((e) => {
      console.error('Error sending state update to widget: ', e);
    });
  }

  private feedStateUpdateForTimelineEvent(ev: MatrixEvent): void {
    if (this.call === null) return;
    if (!ev.isState()) return;
    const raw = ev.getEffectiveEvent() as IRoomEvent | undefined;
    if (raw === undefined) return;
    this.call.feedStateUpdate(raw).catch((e) => {
      console.error('Error sending state update to widget: ', e);
    });
  }

  private async onToDeviceEvent(ev: MatrixEvent): Promise<void> {
    await this.mx.decryptEventIfNeeded(ev);
    if (ev.isDecryptionFailure()) return;
    await this.call?.feedToDevice(ev.getEffectiveEvent() as IRoomEvent, ev.isEncrypted());
  }

  /**
   * Determines whether the event has a relation to an unknown parent.
   */
  private relatesToUnknown(ev: MatrixEvent): boolean {
    // Replies to unknown events don't count
    if (!ev.relationEventId || ev.replyEventId) return false;
    const room = this.mx.getRoom(ev.getRoomId());
    return room === null || !room.findEventById(ev.relationEventId);
  }

  /**
   * Advances the "read up to" marker for a room to a certain event. No-ops if
   * the event is before the marker.
   * @returns Whether the "read up to" marker was advanced.
   */
  private advanceReadUpToMarker(ev: MatrixEvent): boolean {
    const evId = ev.getId();
    if (evId === undefined) return false;
    const roomId = ev.getRoomId();
    if (roomId === undefined) return false;
    const room = this.mx.getRoom(roomId);
    if (room === null) return false;

    const upToEventId = this.readUpToMap[ev.getRoomId()!];
    if (!upToEventId) {
      // There's no marker yet; start it at this event
      this.readUpToMap[roomId] = evId;
      return true;
    }

    // Small optimization for exact match (skip the search)
    if (upToEventId === evId) return false;

    // Timelines are most recent last, so reverse the order and limit ourselves to 100 events
    // to avoid overusing the CPU.
    const timeline = room.getLiveTimeline();
    const events = [...timeline.getEvents()].toReversed().slice(0, 100);
    function isRelevantTimelineEvent(timelineEvent: MatrixEvent): boolean {
      return timelineEvent.getId() === upToEventId || timelineEvent.getId() === ev.getId();
    }
    const possibleMarkerEv = events.find(isRelevantTimelineEvent);
    if (possibleMarkerEv?.getId() === upToEventId) {
      // The event must be somewhere before the "read up to" marker
      return false;
    }
    if (possibleMarkerEv?.getId() === ev.getId()) {
      // The event is after the marker; advance it
      this.readUpToMap[roomId] = evId;
      return true;
    }

    // We can't say for sure whether the widget has seen the event
    // just assume that it has
    return false;
  }

  /**
   * Determines whether the event comes from a room that we've been invited to
   * (in which case we likely don't have the full timeline).
   */
  private isFromInvite(ev: MatrixEvent): boolean {
    const room = this.mx.getRoom(ev.getRoomId());
    return room?.getMyMembership() === KnownMembership.Invite;
  }

  private feedEvent(ev: MatrixEvent): void {
    if (this.call === null) return;
    if (
      // If we had decided earlier to feed this event to the widget, but
      // it just wasn't ready, give it another try
      this.eventsToFeed.delete(ev) ||
      // Skip marker timeline check for events with relations to unknown parent because these
      // events are not added to the timeline here and will be ignored otherwise:
      // https://github.com/matrix-org/matrix-js-sdk/blob/d3dfcd924201d71b434af3d77343b5229b6ed75e/src/models/room.ts#L2207-L2213
      this.relatesToUnknown(ev) ||
      // Skip marker timeline check for rooms where membership is
      // 'invite', otherwise the membership event from the invitation room
      // will advance the marker and new state events will not be
      // forwarded to the widget.
      this.isFromInvite(ev) ||
      // Check whether this event would be before or after our "read up to" marker. If it's
      // before, or we can't decide, then we assume the widget will have already seen the event.
      // If the event is after, or we don't have a marker for the room,
      // then the marker will advance and we'll send it through.
      // This approach of "read up to" prevents widgets receiving decryption spam from startup or
      // receiving ancient events from backfill and such.
      this.advanceReadUpToMarker(ev)
    ) {
      // If the event is still being decrypted, remember that we want to
      // feed it to the widget (even if not strictly in the order given by
      // the timeline) and get back to it later
      if (ev.isBeingDecrypted() || ev.isDecryptionFailure()) {
        this.eventsToFeed.add(ev);
      } else {
        const raw = ev.getEffectiveEvent();
        this.call.feedEvent(raw as IRoomEvent).catch((e) => {
          console.error('Error sending event to widget: ', e);
        });
        this.feedStateUpdateForTimelineEvent(ev);
      }
    } else if (ev.isState()) {
      this.feedStateUpdateForTimelineEvent(ev);
    }
  }

  public listenAction(type: string, callback: (event: CustomEvent<unknown>) => void) {
    return this.listenEvent(`action:${type}`, callback as (event: unknown) => void);
  }

  public listenEvent(type: string, callback: (event: unknown) => void) {
    this.call.on(type, callback);
    return () => {
      this.call.off(type, callback);
    };
  }
}
