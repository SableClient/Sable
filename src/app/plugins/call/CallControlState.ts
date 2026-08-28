export class CallControlState {
  public readonly microphone: boolean;

  public readonly video: boolean;

  public readonly sound: boolean;

  public readonly screenshare: boolean;

  constructor(microphone: boolean, video: boolean, sound: boolean, screenshare = false) {
    this.microphone = microphone;
    this.video = video;
    this.sound = sound;
    this.screenshare = screenshare;
  }
}
