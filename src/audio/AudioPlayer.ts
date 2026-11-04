import { Asset, AssetManager } from "../assets/manager/AssetManager";

export interface AudioPlayerOptions {
    /** How many sounds may ring at once. Default 8. */
    sound_channels?: number;
}

export interface PlaySoundOptions {
    /** This sound's own volume, 0..1, on top of `sound_volume`. Default 1. */
    volume?: number;
}

export interface PlayMusicOptions {
    /** Start over at the end. Default true. */
    loop?: boolean;
}

/** One sound slot: an audio element and what it was last asked to play. */
interface SoundChannel {
    readonly $audio: HTMLAudioElement;
    name: string;
    volume: number;
    /** The how-manieth sound this was: the lowest number is the oldest. */
    order: number;
}

function clamp_volume(volume: number): number {
    return Math.max(0, Math.min(1, volume));
}

/**
 * Plays what `AssetManager` loaded, by name. One audio element can only play one thing: playing
 * it again cuts it off, and an unbounded number of them crackles. So sounds share a fixed set of
 * channels, a new one takes a free channel or else the oldest's, and one music track plays apart
 * from them, under its own volume and mute.
 *
 * Browsers refuse to play before the visitor has clicked or typed. A refused sound is simply
 * gone; a refused track stays wanted, and `resume_music()` tries it again from the next gesture.
 */
export class AudioPlayer {
    private readonly max_channels: number;
    private readonly channels: SoundChannel[] = [];
    private readonly warned_names = new Set<string>();
    private sounds_played = 0;
    private _sound_volume = 0.6;
    private _music_volume = 0.3;
    private _is_sound_muted = false;
    private _is_music_muted = false;
    private $music: HTMLAudioElement | null = null;
    private music_name: string | null = null;
    private _is_music_blocked = false;

    public constructor(
        private readonly assets: AssetManager,
        options: AudioPlayerOptions = {},
    ) {
        this.max_channels = Math.max(1, options.sound_channels ?? 8);
    }

    /** The volume of all sounds, 0..1; ringing ones follow at once. */
    public get sound_volume(): number {
        return this._sound_volume;
    }

    public set sound_volume(volume: number) {
        this._sound_volume = clamp_volume(volume);
        for (const channel of this.channels) {
            this.apply_sound_settings(channel);
        }
    }

    /** The music's volume, 0..1, usually below the sounds'. */
    public get music_volume(): number {
        return this._music_volume;
    }

    public set music_volume(volume: number) {
        this._music_volume = clamp_volume(volume);
        this.apply_music_settings();
    }

    /** While true nothing rings: what is playing goes silent, what comes next does not start. */
    public get is_sound_muted(): boolean {
        return this._is_sound_muted;
    }

    public set is_sound_muted(is_muted: boolean) {
        this._is_sound_muted = is_muted;
        for (const channel of this.channels) {
            this.apply_sound_settings(channel);
        }
    }

    /** While true the music runs on silently, so unmuting finds it where it would have been. */
    public get is_music_muted(): boolean {
        return this._is_music_muted;
    }

    public set is_music_muted(is_muted: boolean) {
        this._is_music_muted = is_muted;
        this.apply_music_settings();
    }

    /** The name of the track playing or wanted; null when none is. */
    public get current_music(): string | null {
        return this.music_name;
    }

    /** True when the browser refused the track, until `resume_music()` gets it going. */
    public get is_music_blocked(): boolean {
        return this._is_music_blocked;
    }

    /** Plays the sound `name`, over whatever else rings; when all channels ring, the oldest stops. */
    public play_sound(name: string, options: PlaySoundOptions = {}): void {
        const asset = this.find(name);
        if (asset === null || this._is_sound_muted) {
            return;
        }
        const taken =
            this.free_channel(name) ??
            this.new_channel() ??
            this.oldest_channel();
        if (taken.name !== name) {
            taken.$audio.src = asset.url;
            taken.name = name;
        }
        taken.$audio.pause();
        taken.$audio.currentTime = 0;
        taken.volume = clamp_volume(options.volume ?? 1);
        this.sounds_played += 1;
        taken.order = this.sounds_played;
        this.apply_sound_settings(taken);
        // A refused or interrupted sound is gone; it has no moment to come back to.
        this.start(taken.$audio).catch(() => {});
    }

    /**
     * Plays the track `name`, replacing another; asking for the one already playing changes
     * nothing, so it does not start over.
     */
    public play_music(name: string, options: PlayMusicOptions = {}): void {
        const asset = this.find(name);
        if (asset === null) {
            return;
        }
        const $music = asset.element;
        $music.loop = options.loop ?? true;
        if (this.music_name === name && !$music.paused) {
            return;
        }
        if (this.music_name !== name) {
            this.stop_music();
            this.$music = $music;
            this.music_name = name;
        }
        this.start_music();
    }

    /**
     * After a gesture: tries a track the browser refused again. Does nothing otherwise, so it can
     * be called on every click and key.
     */
    public resume_music(): void {
        if (this._is_music_blocked) {
            this.start_music();
        }
    }

    public stop_music(): void {
        if (this.$music !== null) {
            this.$music.pause();
            this.$music.currentTime = 0;
        }
        this.$music = null;
        this.music_name = null;
        this._is_music_blocked = false;
    }

    /**
     * Stops everything and lets go of the channels. Volumes and mutes stay, and the next play
     * starts afresh, so an element that is connected again can use the same player.
     */
    public destroy(): void {
        this.stop_music();
        for (const channel of this.channels) {
            channel.$audio.pause();
        }
        this.channels.length = 0;
    }

    /** The loaded asset; an unknown name warns once and is treated as silence. */
    private find(name: string): Asset<HTMLAudioElement> | null {
        const asset = this.assets.audios.get(name);
        if (asset !== undefined) {
            return asset;
        }
        if (!this.warned_names.has(name)) {
            this.warned_names.add(name);
            console.warn(`AudioPlayer: no audio named "${name}" is loaded.`);
        }
        return null;
    }

    /** A channel that rings no more, best one that holds this sound already and need not load it. */
    private free_channel(name: string): SoundChannel | null {
        const free = this.channels.filter(
            ({ $audio }) => $audio.paused || $audio.ended,
        );
        return free.find((channel) => channel.name === name) ?? free[0] ?? null;
    }

    private new_channel(): SoundChannel | null {
        if (this.channels.length >= this.max_channels) {
            return null;
        }
        const channel: SoundChannel = {
            $audio: new Audio(),
            name: "",
            volume: 1,
            order: 0,
        };
        this.channels.push(channel);
        return channel;
    }

    private oldest_channel(): SoundChannel {
        return this.channels.reduce((oldest, channel) =>
            channel.order < oldest.order ? channel : oldest,
        );
    }

    private apply_sound_settings(channel: SoundChannel): void {
        channel.$audio.volume = this._sound_volume * channel.volume;
        channel.$audio.muted = this._is_sound_muted;
    }

    private apply_music_settings(): void {
        if (this.$music !== null) {
            this.$music.volume = this._music_volume;
            this.$music.muted = this._is_music_muted;
        }
    }

    private start_music(): void {
        const $music = this.$music;
        if ($music === null) {
            return;
        }
        this.apply_music_settings();
        this._is_music_blocked = false;
        this.start($music).catch((error: unknown) => {
            const is_refused =
                error instanceof Error && error.name === "NotAllowedError";
            if (is_refused && this.$music === $music) {
                this._is_music_blocked = true;
            }
        });
    }

    private async start($audio: HTMLAudioElement): Promise<void> {
        await $audio.play();
    }
}
