// soundManager.js

class SoundManager {
  constructor() {
    this.muted = false;
    this.bgmAudio = null;
    this.sfxEnabled = true;
    this.audioContext = null;
    this.initialized = false;
  }

  // Initialize audio context on first user interaction (required by browsers)
  initializeAudio() {
    if (this.initialized) return;
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
      console.log('Audio context initialized');
    } catch (e) {
      console.warn('Audio context not supported:', e);
    }
  }

  // Play a quick sound effect (e.g., click, correct, wrong, win)
  playSfx(name) {
    if (!this.sfxEnabled || this.muted) return;

    // Initialize audio context on first play
    this.initializeAudio();

    const sfxLibrary = {
      click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
      correct: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
      wrong: 'https://assets.mixkit.co/active_storage/sfx/2903/2903-preview.mp3',
      win: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
      start: 'https://assets.mixkit.co/active_storage/sfx/2583/2583-preview.mp3'
    };

    const url = sfxLibrary[name];
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.5; // Increased volume for better audibility
      audio.play().catch((err) => {
        console.error("Audio play blocked or interrupted:", err);
      });
    }
  }

  // Toggle or start background music loop
  toggleBgm(customUrl) {
    // Initialize audio context on first toggle
    this.initializeAudio();

    const defaultBgm = 'https://assets.mixkit.co/music/preview/mixkit-game-level-music-689.mp3';
    const musicUrl = customUrl || defaultBgm;

    if (!this.bgmAudio) {
      this.bgmAudio = new Audio(musicUrl);
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.3; // Increased volume slightly
    }

    if (this.bgmAudio.paused) {
      // Start playing
      this.bgmAudio.play().catch((err) => {
        console.error("BGM autoplay restricted:", err);
      });
      return true; // Returns current playing state (is playing now: true)
    } else {
      // Pause
      this.bgmAudio.pause();
      return false; // Returns current playing state (is playing now: false)
    }
  }
}

export const sounds = new SoundManager();