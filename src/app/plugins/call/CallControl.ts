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

  private setMediaState(state: ElementMediaStatePayload) {
    return this.call.transport.send(ElementWidgetActions.DeviceMute, state);
  }

  private setSound(sound: boolean): void {
    const callDocument = this.iframe.contentDocument ?? this.iframe.contentWindow?.document;
    if (callDocument) {
      callDocument.querySelectorAll('audio').forEach((el) => {
        el.muted = !sound;
      });
    }
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
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
