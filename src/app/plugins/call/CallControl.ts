import type { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'eventemitter3';
import { CallControlState } from './CallControlState';
import type { ElementMediaStateDetail, ElementMediaStatePayload } from './types';
import { ElementWidgetActions } from './types';
import {
  getGridControl,
  getReactionsButton,
  getScreenshareButton,
  getSettingsButton,
  getSpotlightControl,
  isElementToggledOn,
} from './elementCallDomAdapter';

export enum CallControlEvent {
  StateUpdate = 'state_update',
}

export class CallControl extends EventEmitter implements CallControlState {
  private state: CallControlState;

  private call: ClientWidgetApi;

  private iframe: HTMLIFrameElement;

  private controlMutationObserver: MutationObserver;
  private audioMutationObserver: MutationObserver;
  private outputOverrideMuted = false;
  private patchedWindow: Window | undefined;
  private readonly trackedAudioContexts = new Set<AudioContext>();
  private readonly runningContextsBeforeOverride = new WeakMap<AudioContext, boolean>();
  private readonly audioPatchRestores: Array<() => void> = [];

  private get document(): Document | undefined {
    return this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
  }

  private get screenshareButton(): HTMLElement | undefined {
    return getScreenshareButton(this.document);
  }

  private get settingsButton(): HTMLElement | undefined {
    return getSettingsButton(this.document);
  }

  private get reactionsButton(): HTMLElement | undefined {
    return getReactionsButton(this.document);
  }

  private get spotlightControl(): HTMLElement | undefined {
    return getSpotlightControl(this.document);
  }

  private get gridControl(): HTMLElement | undefined {
    return getGridControl(this.document);
  }

  constructor(state: CallControlState, call: ClientWidgetApi, iframe: HTMLIFrameElement) {
    super();

    this.state = state;
    this.call = call;
    this.iframe = iframe;

    this.controlMutationObserver = new MutationObserver(this.onControlMutation.bind(this));
    this.audioMutationObserver = new MutationObserver(() => {
      this.applyOutputMute();
    });
  }

  public getState(): CallControlState {
    return this.state;
  }

  public get microphone(): boolean {
    return this.state.microphone;
  }

  public get video(): boolean {
    return this.state.video;
  }

  public get sound(): boolean {
    return this.state.sound;
  }

  public get screenshare(): boolean {
    return this.state.screenshare;
  }

  public get spotlight(): boolean {
    return this.state.spotlight;
  }

  public async applyState() {
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
    });
    this.setSound(this.sound);
    this.emitStateUpdate();
  }

  public startObserving() {
    this.controlMutationObserver.disconnect();

    const screenshareBtn = this.screenshareButton;
    if (screenshareBtn) {
      this.controlMutationObserver.observe(screenshareBtn, {
        attributes: true,
        attributeFilter: ['data-kind', 'aria-pressed', 'aria-checked', 'class'],
      });
    }
    const spotlightControl = this.spotlightControl;
    if (spotlightControl) {
      this.controlMutationObserver.observe(spotlightControl, {
        attributes: true,
        attributeFilter: ['checked', 'aria-pressed', 'aria-checked', 'data-kind', 'class'],
      });
    }

    this.onControlMutation();
  }

  public applySound() {
    this.setSound(this.sound);
  }

  public setOutputOverrideMuted(muted: boolean) {
    const win = this.iframe.contentWindow;
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    const windowChanged = !!win && this.patchedWindow !== win;
    if (this.outputOverrideMuted === muted && !windowChanged) return;
    this.outputOverrideMuted = muted;

    if (muted) {
      const target = callDocument?.body;
      if (target) {
        this.audioMutationObserver.observe(target, {
          childList: true,
          subtree: true,
        });
      }
      if (win) {
        this.ensureAudioPatches(win);
        this.collectExistingAudioContexts(win);
        this.suspendTrackedAudioContexts();
      }
    } else {
      this.audioMutationObserver.disconnect();
      this.resumeTrackedAudioContexts();
      this.teardownAudioPatches();
    }
    this.applyOutputMute();
  }

  private setMediaState(state: ElementMediaStatePayload) {
    return this.call.transport.send(ElementWidgetActions.DeviceMute, state);
  }

  private setSound(sound: boolean): void {
    this.applyOutputMute(sound);
  }

  private applyOutputMute(sound = this.sound): void {
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    const shouldMute = this.outputOverrideMuted || !sound;
    if (callDocument) {
      callDocument.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
        el.muted = shouldMute;
        if (shouldMute) el.volume = 0;
      });
    }
  }

  private ensureAudioPatches(win: Window): void {
    if (this.patchedWindow === win) return;
    this.teardownAudioPatches();
    this.patchedWindow = win;

    this.patchAudioContextConstructor(win, 'AudioContext');
    this.patchAudioContextConstructor(win, 'webkitAudioContext');
  }

  private patchAudioContextConstructor(win: Window, key: 'AudioContext' | 'webkitAudioContext') {
    const scopedWindow = win as Window &
      Partial<Record<'AudioContext' | 'webkitAudioContext', typeof AudioContext>>;
    const originalCtor = scopedWindow[key];
    if (typeof originalCtor !== 'function') return;

    const resumeDescriptor = Object.getOwnPropertyDescriptor(originalCtor.prototype, 'resume');
    const originalResumeImpl = resumeDescriptor?.value as
      | ((this: AudioContext) => Promise<void>)
      | undefined;
    if (typeof originalResumeImpl !== 'function') return;
    const originalResume = (context: AudioContext): Promise<void> => originalResumeImpl.call(context);
    const trackedContexts = this.trackedAudioContexts;
    const isOverrideMuted = () => this.outputOverrideMuted;
    originalCtor.prototype.resume = function patchedResume(this: AudioContext) {
      trackedContexts.add(this);
      if (isOverrideMuted()) {
        return Promise.resolve();
      }
      return originalResume(this);
    };
    this.audioPatchRestores.push(() => {
      originalCtor.prototype.resume = originalResumeImpl;
    });

    const wrappedCtor = function patchedAudioContext(
      this: unknown,
      ...args: ConstructorParameters<typeof AudioContext>
    ) {
      const context = Reflect.construct(
        originalCtor,
        args,
        new.target ?? originalCtor
      ) as AudioContext;
      trackedContexts.add(context);
      if (isOverrideMuted()) {
        void context.suspend().catch(() => {});
      }
      return context;
    } as unknown as typeof AudioContext;
    wrappedCtor.prototype = originalCtor.prototype;
    Object.setPrototypeOf(wrappedCtor, originalCtor);

    scopedWindow[key] = wrappedCtor;
    this.audioPatchRestores.push(() => {
      scopedWindow[key] = originalCtor;
    });
  }

  private teardownAudioPatches(): void {
    this.audioPatchRestores.splice(0).forEach((restore) => restore());
    this.patchedWindow = undefined;
  }

  private collectExistingAudioContexts(win: Window): void {
    const scopedWindow = win as Window &
      Partial<Record<'AudioContext' | 'webkitAudioContext', typeof AudioContext>>;
    const audioCtor = scopedWindow.AudioContext;
    if (!audioCtor) return;

    Object.values(win as unknown as Record<string, unknown>).forEach((value) => {
      if (value instanceof audioCtor) {
        this.trackedAudioContexts.add(value);
      }
    });
  }

  private suspendTrackedAudioContexts(): void {
    this.trackedAudioContexts.forEach((context) => {
      const wasRunning = context.state === 'running';
      this.runningContextsBeforeOverride.set(context, wasRunning);
      if (wasRunning) {
        void context.suspend().catch(() => {});
      }
    });
  }

  private resumeTrackedAudioContexts(): void {
    this.trackedAudioContexts.forEach((context) => {
      const wasRunning = this.runningContextsBeforeOverride.get(context) ?? false;
      if (wasRunning) {
        void context.resume().catch(() => {});
      }
      this.runningContextsBeforeOverride.delete(context);
    });
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      data.video_enabled ?? this.video,
      this.sound,
      this.screenshare,
      this.spotlight
    );

    this.state = state;
    this.emitStateUpdate();

    if (this.microphone && !this.sound) {
      this.toggleSound();
    }
  }

  public onControlMutation() {
    const screenshare: boolean = isElementToggledOn(this.screenshareButton);
    const spotlight: boolean = isElementToggledOn(this.spotlightControl);

    this.state = new CallControlState(
      this.microphone,
      this.video,
      this.sound,
      screenshare,
      spotlight
    );
    this.emitStateUpdate();
  }

  public toggleMicrophone() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: !this.microphone,
      video_enabled: this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleVideo() {
    const payload: ElementMediaStatePayload = {
      audio_enabled: this.microphone,
      video_enabled: !this.video,
    };
    return this.setMediaState(payload);
  }

  public toggleSound() {
    const sound = !this.sound;

    this.setSound(sound);

    const state = new CallControlState(
      this.microphone,
      this.video,
      sound,
      this.screenshare,
      this.spotlight
    );
    this.state = state;
    this.emitStateUpdate();

    if (!this.sound && this.microphone) {
      this.toggleMicrophone();
    }
  }

  public toggleScreenshare() {
    this.screenshareButton?.click();
  }

  public toggleSpotlight() {
    if (this.spotlight) {
      this.gridControl?.click();
      return;
    }
    this.spotlightControl?.click();
  }

  public toggleReactions() {
    this.reactionsButton?.click();
  }

  public toggleSettings() {
    this.settingsButton?.click();
  }

  public dispose() {
    this.controlMutationObserver.disconnect();
    this.audioMutationObserver.disconnect();
    this.resumeTrackedAudioContexts();
    this.teardownAudioPatches();
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
