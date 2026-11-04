import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../assets/manager/AssetManager";
import { AudioPlayer } from "./AudioPlayer";

/** Stands in for an audio element: jsdom plays nothing, so the test says what the browser does. */
class FakeAudio {
    public static created: FakeAudio[] = [];
    /** What the next `play()` does; a browser that refuses rejects with `NotAllowedError`. */
    public static next_play: () => Promise<void> = () => Promise.resolve();
    public paused = true;
    public ended = false;
    public muted = false;
    public volume = 1;
    public loop = false;
    public plays = 0;
    public cuts = 0;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public currentTime = 12;

    public constructor(public src: string = "") {
        FakeAudio.created.push(this);
    }

    public play(): Promise<void> {
        this.plays += 1;
        this.paused = false;
        this.ended = false;
        return FakeAudio.next_play().catch((error: unknown) => {
            this.paused = true;
            throw error;
        });
    }

    public pause(): void {
        if (!this.paused) {
            this.cuts += 1;
        }
        this.paused = true;
    }

    /** The sound rang out. */
    public finish(): void {
        this.ended = true;
        this.paused = true;
    }
}

function refused(): Promise<void> {
    const error = new Error("The browser wants a gesture first.");
    error.name = "NotAllowedError";
    return Promise.reject(error);
}

describe("AudioPlayer", () => {
    let assets: AssetManager;
    let player: AudioPlayer;
    let warn: ReturnType<typeof vi.spyOn>;

    function add(name: string): FakeAudio {
        const $audio = new FakeAudio(`${name}.url`);
        assets.audios.set(name, {
            element: $audio as unknown as HTMLAudioElement,
            url: `${name}.url`,
            ready: true,
        });
        return $audio;
    }

    /** The channels: every audio element the player made itself, not the loaded assets. */
    function channels(): FakeAudio[] {
        const loaded = [...assets.audios.values()].map(
            (asset) => asset.element as unknown as FakeAudio,
        );
        return FakeAudio.created.filter(($audio) => !loaded.includes($audio));
    }

    beforeEach(() => {
        FakeAudio.created = [];
        FakeAudio.next_play = () => Promise.resolve();
        vi.stubGlobal("Audio", FakeAudio);
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        assets = new AssetManager();
        add("bip");
        add("bop");
        add("track-a");
        add("track-b");
        player = new AudioPlayer(assets, { sound_channels: 3 });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe("sounds", () => {
        it("overlaps: the same sound again rings next to the first, not over it", () => {
            player.play_sound("bip");
            player.play_sound("bip");
            const [first, second] = channels();
            expect(channels().length).toBe(2);
            expect(first.paused).toBe(false);
            expect(first.cuts).toBe(0);
            expect(second.paused).toBe(false);
            expect(second.src).toBe("bip.url");
        });

        it("drops the oldest when all channels ring, and only that one", () => {
            player.play_sound("bip");
            player.play_sound("bop");
            player.play_sound("bip");
            const [oldest, middle, newest] = channels();
            player.play_sound("bop");
            expect(channels().length).toBe(3);
            expect(oldest.cuts).toBe(1);
            expect(oldest.src).toBe("bop.url");
            expect(oldest.paused).toBe(false);
            expect(middle.cuts).toBe(0);
            expect(newest.cuts).toBe(0);
            player.play_sound("bop");
            expect(middle.cuts).toBe(1);
        });

        it("takes a channel that rang out before dropping anything, and rewinds it", () => {
            player.play_sound("bip");
            player.play_sound("bop");
            player.play_sound("bip");
            const [first, second, third] = channels();
            second.finish();
            second.currentTime = 9;
            player.play_sound("bop");
            expect(channels().length).toBe(3);
            expect(second.paused).toBe(false);
            expect(second.currentTime).toBe(0);
            expect(first.cuts + third.cuts).toBe(0);
        });

        it("prefers a free channel that already holds the sound: no second load", () => {
            player.play_sound("bip");
            player.play_sound("bop");
            const [first, second] = channels();
            first.finish();
            second.finish();
            player.play_sound("bop");
            expect(second.plays).toBe(2);
            expect(first.plays).toBe(1);
        });

        it("multiplies the sound's own volume with the player's, and follows changes", () => {
            player.sound_volume = 0.5;
            player.play_sound("bip", { volume: 0.5 });
            const [channel] = channels();
            expect(channel.volume).toBe(0.25);
            player.sound_volume = 1;
            expect(channel.volume).toBe(0.5);
        });

        it("keeps volumes in 0..1, because a media element throws outside", () => {
            player.sound_volume = 3;
            expect(player.sound_volume).toBe(1);
            player.music_volume = -1;
            expect(player.music_volume).toBe(0);
            player.play_sound("bip", { volume: 7 });
            expect(channels()[0].volume).toBe(1);
        });
    });

    describe("muting", () => {
        it("silences the sounds that ring and starts none that come next", () => {
            player.play_sound("bip");
            const [ringing] = channels();
            player.is_sound_muted = true;
            expect(ringing.muted).toBe(true);
            player.play_sound("bop");
            expect(channels().length).toBe(1);
            expect(ringing.plays).toBe(1);
        });

        it("lets the music run on silently, and brings it back where it is", () => {
            const track = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            player.play_music("track-a");
            player.is_music_muted = true;
            expect(track.muted).toBe(true);
            expect(track.paused).toBe(false);
            player.is_music_muted = false;
            expect(track.muted).toBe(false);
            expect(track.plays).toBe(1);
        });

        it("keeps the two channels apart", () => {
            const track = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            player.play_music("track-a");
            player.is_sound_muted = true;
            expect(track.muted).toBe(false);
            player.is_sound_muted = false;
            player.is_music_muted = true;
            player.play_sound("bip");
            expect(channels()[0].muted).toBe(false);
        });

        it("applies a mute chosen before the music starts", () => {
            player.is_music_muted = true;
            player.play_music("track-a");
            const track = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            expect(track.muted).toBe(true);
            expect(track.paused).toBe(false);
        });
    });

    describe("music", () => {
        const track = (name: string): FakeAudio =>
            assets.audios.get(name)!.element as unknown as FakeAudio;

        it("loops unless told not to", () => {
            player.play_music("track-a");
            expect(track("track-a").loop).toBe(true);
            player.play_music("track-b", { loop: false });
            expect(track("track-b").loop).toBe(false);
        });

        it("plays under its own volume", () => {
            player.music_volume = 0.2;
            player.play_music("track-a");
            expect(track("track-a").volume).toBe(0.2);
            player.music_volume = 0.1;
            expect(track("track-a").volume).toBe(0.1);
        });

        it("replaces music with music: one track at a time", () => {
            player.play_music("track-a");
            player.play_music("track-b");
            expect(track("track-a").paused).toBe(true);
            expect(track("track-b").paused).toBe(false);
            expect(player.current_music).toBe("track-b");
        });

        it("does not start a track over that is already playing", () => {
            player.play_music("track-a");
            track("track-a").currentTime = 40;
            player.play_music("track-a");
            expect(track("track-a").plays).toBe(1);
            expect(track("track-a").currentTime).toBe(40);
        });

        it("stops and rewinds", () => {
            player.play_music("track-a");
            player.stop_music();
            expect(track("track-a").paused).toBe(true);
            expect(track("track-a").currentTime).toBe(0);
            expect(player.current_music).toBe(null);
        });

        it("uses no sound channel", () => {
            player.play_music("track-a");
            expect(channels()).toEqual([]);
        });
    });

    describe("the autoplay rule", () => {
        it("does not throw when the browser refuses a sound", async () => {
            FakeAudio.next_play = refused;
            expect(() => player.play_sound("bip")).not.toThrow();
            await new Promise((resolve) => setTimeout(resolve));
            expect(channels()[0].paused).toBe(true);
        });

        it("remembers a refused track and plays it after the next gesture", async () => {
            FakeAudio.next_play = refused;
            player.play_music("track-a");
            await new Promise((resolve) => setTimeout(resolve));
            expect(player.is_music_blocked).toBe(true);
            expect(player.current_music).toBe("track-a");

            FakeAudio.next_play = () => Promise.resolve();
            player.resume_music();
            await new Promise((resolve) => setTimeout(resolve));
            const $music = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            expect(player.is_music_blocked).toBe(false);
            expect($music.paused).toBe(false);
            expect($music.plays).toBe(2);
        });

        it("does nothing on a gesture when nothing was refused", () => {
            player.play_music("track-a");
            player.resume_music();
            const $music = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            expect($music.plays).toBe(1);
        });

        it("does not call an interrupted track refused", async () => {
            FakeAudio.next_play = () => {
                const error = new Error("play() was interrupted by pause().");
                error.name = "AbortError";
                return Promise.reject(error);
            };
            player.play_music("track-a");
            await new Promise((resolve) => setTimeout(resolve));
            expect(player.is_music_blocked).toBe(false);
        });

        it("forgets a refusal when the track was stopped meanwhile", async () => {
            FakeAudio.next_play = refused;
            player.play_music("track-a");
            player.stop_music();
            await new Promise((resolve) => setTimeout(resolve));
            expect(player.is_music_blocked).toBe(false);
        });
    });

    describe("unknown names", () => {
        it("warn once and play nothing", () => {
            player.play_sound("nope");
            player.play_sound("nope");
            player.play_music("nope");
            expect(warn).toHaveBeenCalledTimes(1);
            expect(channels()).toEqual([]);
            expect(player.current_music).toBe(null);
        });

        it("leave the track that is playing alone", () => {
            player.play_music("track-a");
            player.play_music("nope");
            expect(player.current_music).toBe("track-a");
        });
    });

    describe("destroy", () => {
        it("stops everything", () => {
            player.play_sound("bip");
            player.play_sound("bop");
            player.play_music("track-a");
            const ringing = channels();
            player.destroy();
            expect(ringing.every(($audio) => $audio.paused)).toBe(true);
            expect(
                (assets.audios.get("track-a")!.element as unknown as FakeAudio)
                    .paused,
            ).toBe(true);
            expect(player.current_music).toBe(null);
        });

        it("keeps the mutes and works again afterwards", () => {
            player.is_music_muted = true;
            player.play_sound("bip");
            player.destroy();
            player.play_sound("bip");
            player.play_music("track-a");
            expect(player.is_music_muted).toBe(true);
            expect(channels().length).toBe(2);
            const $music = assets.audios.get("track-a")!
                .element as unknown as FakeAudio;
            expect($music.paused).toBe(false);
            expect($music.muted).toBe(true);
        });
    });
});
