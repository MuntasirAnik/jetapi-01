/**
 * Web Audio API based notification sound synthesizer for JetAPI.
 * Provides pleasant, lightweight, zero-dependency message notification chimes
 * with global and per-team mute controls.
 */

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private globalSoundEnabled: boolean = true;
  private mutedTeams: Set<string> = new Set();
  private recentMessages: Set<string> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const savedGlobal = localStorage.getItem("jetapi_chat_sound_enabled");
        if (savedGlobal !== null) {
          this.globalSoundEnabled = savedGlobal === "true";
        }

        const savedTeams = localStorage.getItem("jetapi_muted_teams");
        if (savedTeams) {
          const parsed = JSON.parse(savedTeams);
          if (Array.isArray(parsed)) {
            this.mutedTeams = new Set(parsed);
          }
        }
      } catch {}
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  public isGlobalEnabled(): boolean {
    return this.globalSoundEnabled;
  }

  public setGlobalEnabled(enabled: boolean): void {
    this.globalSoundEnabled = enabled;
    try {
      localStorage.setItem("jetapi_chat_sound_enabled", String(enabled));
    } catch {}
  }

  public toggleGlobal(): boolean {
    const nextState = !this.globalSoundEnabled;
    this.setGlobalEnabled(nextState);
    if (nextState) {
      this.playMessageSound();
    }
    return nextState;
  }

  public isTeamMuted(orgId: string): boolean {
    if (!orgId) return false;
    return this.mutedTeams.has(orgId);
  }

  public setTeamMuted(orgId: string, muted: boolean): void {
    if (!orgId) return;
    if (muted) {
      this.mutedTeams.add(orgId);
    } else {
      this.mutedTeams.delete(orgId);
    }
    try {
      localStorage.setItem("jetapi_muted_teams", JSON.stringify(Array.from(this.mutedTeams)));
    } catch {}
  }

  public toggleTeamMuted(orgId: string): boolean {
    if (!orgId) return false;
    const isMuted = this.isTeamMuted(orgId);
    const nextState = !isMuted;
    this.setTeamMuted(orgId, nextState);
    if (!nextState && this.globalSoundEnabled) {
      this.playMessageSound();
    }
    return nextState;
  }

  public isSoundEnabled(orgId?: string): boolean {
    if (!this.globalSoundEnabled) return false;
    if (orgId && this.mutedTeams.has(orgId)) return false;
    return true;
  }

  /**
   * Plays a pleasant dual-tone message notification chime.
   * Features automatic deduplication and per-team mute checks.
   */
  public playMessageSound(messageId?: string, orgId?: string): void {
    if (!this.isSoundEnabled(orgId)) return;

    // Deduplicate by messageId within 2 seconds
    if (messageId) {
      if (this.recentMessages.has(messageId)) return;
      this.recentMessages.add(messageId);
      setTimeout(() => this.recentMessages.delete(messageId), 2000);
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Master Gain for smooth volume control
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(ctx.destination);

      // Tone 1: 587.33 Hz (D5) - soft initial pop
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08); // slides to A5

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(masterGain);

      osc1.start(now);
      osc1.stop(now + 0.13);

      // Tone 2: 1046.5 Hz (C6) - resonant bell chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1046.5, now + 0.06);

      gain2.gain.setValueAtTime(0.001, now + 0.06);
      gain2.gain.linearRampToValueAtTime(0.32, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc2.connect(gain2);
      gain2.connect(masterGain);

      osc2.start(now + 0.06);
      osc2.stop(now + 0.3);

      // Subtle harmonic overtone (triangle wave at 1318.5 Hz E6 for warmth)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(1318.51, now + 0.07);

      gain3.gain.setValueAtTime(0.001, now + 0.07);
      gain3.gain.linearRampToValueAtTime(0.1, now + 0.09);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc3.connect(gain3);
      gain3.connect(masterGain);

      osc3.start(now + 0.07);
      osc3.stop(now + 0.25);
    } catch (e) {
      // Audio playback fails gracefully if browser blocked autoplay
    }
  }
}

export const soundManager = new SoundManager();
export const playNotificationSound = (messageId?: string, orgId?: string) =>
  soundManager.playMessageSound(messageId, orgId);
