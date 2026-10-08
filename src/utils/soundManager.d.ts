export declare class SoundManager {
  private muted: boolean;
  private bgmAudio: HTMLAudioElement | null;
  private sfxEnabled: boolean;
  private audioContext: AudioContext | null;
  private initialized: boolean;

  constructor();

  initializeAudio(): void;

  playSfx(name: string): void;

  toggleBgm(customUrl?: string): boolean;
}

export declare const sounds: SoundManager;
