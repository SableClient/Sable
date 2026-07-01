import type { ClientWidgetApi } from 'matrix-widget-api';
import EventEmitter from 'eventemitter3';
import { CallControlState } from './CallControlState';
import type { ElementMediaStateDetail, ElementMediaStatePayload } from './types';
import { ElementWidgetActions } from './types';
import { getScreenshareButton, isElementToggledOn } from './elementCallDomAdapter';

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

  public async applyState() {
    await this.setMediaState({
      audio_enabled: this.microphone,
      video_enabled: this.video,
      audio_output_enabled: this.sound,
    });
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

    this.onControlMutation();
  }

  public applySound() {
    this.setSound(this.sound);
  }

  private setMediaState(state: ElementMediaStatePayload) {
    return this.call.transport.send(ElementWidgetActions.DeviceMute, state);
  }

  private setSound(sound: boolean): void {
    this.setMediaState({
      audio_output_enabled: sound,
    });
  }

  public onMediaState(evt: CustomEvent<ElementMediaStateDetail>) {
    const { data } = evt.detail;
    if (!data) return;

    const micTurnedOn = data.audio_enabled === true && !this.microphone;
    const soundTurnedOff = data.audio_output_enabled === false && this.sound;

    const state = new CallControlState(
      data.audio_enabled ?? this.microphone,
      data.video_enabled ?? this.video,
      data.audio_output_enabled ?? this.sound,
      this.screenshare
    );

    this.state = state;
    this.emitStateUpdate();

    if (micTurnedOn && !this.sound) {
      this.toggleSound();
    } else if (soundTurnedOff && this.microphone) {
      this.toggleMicrophone();
    }
  }

  public onControlMutation() {
    const screenshare: boolean = isElementToggledOn(this.screenshareButton);

    this.state = new CallControlState(this.microphone, this.video, this.sound, screenshare);
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

    const state = new CallControlState(this.microphone, this.video, sound, this.screenshare);
    this.state = state;
    this.emitStateUpdate();

    if (!this.sound && this.microphone) {
      this.toggleMicrophone();
    }
  }

  public toggleScreenshare() {
    this.screenshareButton?.click();
  }

  public dispose() {
    this.controlMutationObserver.disconnect();
  }

  private emitStateUpdate() {
    this.emit(CallControlEvent.StateUpdate);
  }
}
