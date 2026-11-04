import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** Stands in for `Audio`: jsdom plays nothing, so the test says what the browser does. */
class FakeAudio {
    public static created: FakeAudio[] = [];
    public static next_play: () => Promise<void> = () => Promise.resolve();
    public paused = true;
    public ended = false;
    public muted = false;
    public volume = 1;
    public loop = false;
    public preload = "";
    public crossOrigin = "";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public currentTime = 0;
    public plays = 0;
    public loads = 0;
    private readonly listeners = new Map<string, () => void>();

    public constructor(public src: string = "") {
        FakeAudio.created.push(this);
    }

    public addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, listener);
    }

    public fire(type: "canplay" | "error"): void {
        this.listeners.get(type)?.();
    }

    public load(): void {
        this.loads += 1;
    }

    public play(): Promise<void> {
        this.plays += 1;
        this.paused = false;
        return FakeAudio.next_play().catch((error: unknown) => {
            this.paused = true;
            throw error;
        });
    }

    public pause(): void {
        this.paused = true;
    }
}

/** The audio element loaded for `url`. */
function loaded(url: string): FakeAudio {
    return FakeAudio.created.find(($audio) => $audio.src === url)!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class SoundSettings extends CanvasGameSettings {
    public override readonly title = "Sounds";
    public override readonly sounds = { bip: "bip.wav", song: "song.mp3" };
    public override readonly music = "song";
}

class SoundRenderer extends CanvasGameRenderer<null, SoundSettings> {
    protected paint(): void {}
}

class SoundLogic extends CanvasGameLogic<null, SoundSettings> {
    protected create_game(): null {
        return null;
    }
}

class SoundElement extends CanvasGameElement<SoundLogic> {
    public readonly logic = this.assemble({
        settings: SoundSettings,
        renderer: SoundRenderer,
        logic: SoundLogic,
    });
}

class SilentSettings extends CanvasGameSettings {
    public override readonly sounds = { bip: "bip.wav" };
}

class SilentRenderer extends CanvasGameRenderer<null, SilentSettings> {
    protected paint(): void {}
}

class SilentLogic extends CanvasGameLogic<null, SilentSettings> {
    protected create_game(): null {
        return null;
    }
}

/** Sounds, but no track of its own. */
class SilentElement extends CanvasGameElement<SilentLogic> {
    public readonly logic = this.assemble({
        settings: SilentSettings,
        renderer: SilentRenderer,
        logic: SilentLogic,
    });
}

class PlainRenderer extends CanvasGameRenderer<null> {
    protected paint(): void {}
}

class PlainLogic extends CanvasGameLogic<null> {
    protected create_game(): null {
        return null;
    }
}

class PlainElement extends CanvasGameElement<PlainLogic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        renderer: PlainRenderer,
        logic: PlainLogic,
    });
}

customElements.define("test-sounds", SoundElement);
customElements.define("test-sounds-no-music", SilentElement);
customElements.define("test-sounds-plain", PlainElement);

describe("the shell's sounds", () => {
    beforeEach(() => {
        FakeAudio.created = [];
        FakeAudio.next_play = () => Promise.resolve();
        vi.stubGlobal("Audio", FakeAudio);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                {},
                {
                    get: () => vi.fn(),
                    set: () => true,
                },
            ) as unknown as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** Connected without the intro: the game is playing at once. */
    function connect_playing(): SoundElement {
        const $element = document.createElement("test-sounds") as SoundElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    it("loads the listed sounds once, whatever the connections", () => {
        const $element = connect_playing();
        expect(FakeAudio.created.map(($audio) => $audio.src)).toEqual([
            "bip.wav",
            "song.mp3",
        ]);
        expect(loaded("bip.wav").loads).toBe(1);
        $element.remove();
        document.body.append($element);
        expect(FakeAudio.created.length).toBe(2);
    });

    it("gives the game a player over the loaded sounds", () => {
        const $element = connect_playing();
        const audio = $element.logic.properties.audio;
        audio.play_sound("bip");
        // The loaded two and one channel.
        expect(FakeAudio.created.length).toBe(3);
        expect(FakeAudio.created[2].src).toBe("bip.wav");
        expect(FakeAudio.created[2].paused).toBe(false);
    });

    it("survives a sound that fails to load", async () => {
        connect_playing();
        loaded("bip.wav").fire("error");
        await flush();
        expect(console.warn).toHaveBeenCalled();
    });

    describe("the music and the intro", () => {
        function connect_with_intro(): SoundElement {
            const $element = document.createElement(
                "test-sounds",
            ) as SoundElement;
            document.body.append($element);
            return $element;
        }

        it("stays silent on the start screen and through the intro, and starts after it", async () => {
            const $element = connect_with_intro();
            const intro = $element.logic.properties.intro;
            const song = loaded("song.mp3");
            expect(intro.state).toBe("waiting");
            expect(song.plays).toBe(0);

            // The default intro source rejects, but only after this very moment.
            expect(intro.leave()).toBe(true);
            expect(intro.state).toBe("playing");
            expect(song.plays).toBe(0);

            await flush();
            expect(intro.state).toBe("done");
            expect(song.plays).toBe(1);
            expect(song.paused).toBe(false);
            expect(song.loop).toBe(true);
        });

        it("does not start when the element leaves during the intro", async () => {
            const $element = connect_with_intro();
            $element.logic.properties.intro.leave();
            $element.remove();
            await flush();
            expect(loaded("song.mp3").plays).toBe(0);
        });

        it("waits again when the element comes back on the start screen", async () => {
            const $element = connect_with_intro();
            $element.remove();
            document.body.append($element);
            await flush();
            expect($element.logic.properties.intro.state).toBe("waiting");
            expect(loaded("song.mp3").plays).toBe(0);
        });

        it("starts at once without an intro", () => {
            connect_playing();
            expect(loaded("song.mp3").plays).toBe(1);
        });

        it("asks the browser once, also when it refuses at once and the track stays paused", () => {
            const play = vi
                .spyOn(FakeAudio.prototype, "play")
                .mockImplementation(function (this: FakeAudio) {
                    this.plays += 1;
                    return Promise.resolve();
                });
            connect_playing();
            expect(loaded("song.mp3").plays).toBe(1);
            play.mockRestore();
        });
    });

    describe("disconnecting", () => {
        it("stops the music and every sound", () => {
            const $element = connect_playing();
            $element.logic.properties.audio.play_sound("bip");
            const channel = FakeAudio.created[2];
            const song = loaded("song.mp3");
            expect(song.paused).toBe(false);
            $element.remove();
            expect(song.paused).toBe(true);
            expect(channel.paused).toBe(true);
            expect($element.logic.properties.audio.current_music).toBe(null);
        });

        it("brings the music back on a reconnect, once and with the mutes as they were", () => {
            const $element = connect_playing();
            const audio = $element.logic.properties.audio;
            const song = loaded("song.mp3");
            audio.is_music_muted = true;
            audio.is_sound_muted = true;
            $element.remove();
            document.body.append($element);
            expect(song.paused).toBe(false);
            expect(song.plays).toBe(2);
            expect(song.muted).toBe(true);
            expect(audio.is_sound_muted).toBe(true);
            expect($element.logic.properties.audio).toBe(audio);
        });

        it("hears no gesture after the element is gone", async () => {
            FakeAudio.next_play = () => {
                const error = new Error("no gesture yet");
                error.name = "NotAllowedError";
                return Promise.reject(error);
            };
            const $element = connect_playing();
            await flush();
            $element.remove();
            FakeAudio.next_play = () => Promise.resolve();
            $element.dispatchEvent(new Event("pointerdown"));
            expect(loaded("song.mp3").paused).toBe(true);
        });
    });

    describe("a hidden tab", () => {
        let is_hidden = false;

        function switch_tab(hidden: boolean): void {
            is_hidden = hidden;
            document.dispatchEvent(new Event("visibilitychange"));
        }

        beforeEach(() => {
            is_hidden = false;
            vi.spyOn(document, "hidden", "get").mockImplementation(
                () => is_hidden,
            );
        });

        it("holds the music where it is, and it goes on from there on return", () => {
            connect_playing();
            const song = loaded("song.mp3");
            song.currentTime = 42;
            switch_tab(true);
            expect(song.paused).toBe(true);
            expect(song.currentTime).toBe(42);
            switch_tab(false);
            expect(song.paused).toBe(false);
            expect(song.currentTime).toBe(42);
        });

        it("keeps the mutes through it", () => {
            const $element = connect_playing();
            const song = loaded("song.mp3");
            $element.logic.properties.audio.is_music_muted = true;
            switch_tab(true);
            switch_tab(false);
            expect(song.paused).toBe(false);
            expect(song.muted).toBe(true);
        });

        it("does not start the track before the intro is over", () => {
            const $element = document.createElement(
                "test-sounds",
            ) as SoundElement;
            document.body.append($element);
            switch_tab(true);
            switch_tab(false);
            expect(loaded("song.mp3").plays).toBe(0);
        });

        it("makes a track due while hidden wait: an intro that ends there, a start there", async () => {
            const $element = document.createElement(
                "test-sounds",
            ) as SoundElement;
            document.body.append($element);
            $element.logic.properties.intro.leave();
            switch_tab(true);
            await flush();
            expect($element.logic.properties.intro.state).toBe("done");
            expect(loaded("song.mp3").plays).toBe(0);
            switch_tab(false);
            expect(loaded("song.mp3").plays).toBe(1);
        });

        it("starts held when the element connects in a hidden tab", () => {
            is_hidden = true;
            connect_playing();
            const song = loaded("song.mp3");
            expect(song.plays).toBe(0);
            switch_tab(false);
            expect(song.paused).toBe(false);
        });

        it("hears no more of the tab after the element is gone", () => {
            const $element = connect_playing();
            const song = loaded("song.mp3");
            $element.remove();
            switch_tab(true);
            switch_tab(false);
            expect(song.paused).toBe(true);
            expect($element.logic.properties.audio.is_music_held).toBe(false);
        });

        it("a game without music does not mind", () => {
            const $element = document.createElement(
                "test-sounds-no-music",
            ) as SilentElement;
            $element.setAttribute("init-intro", "false");
            document.body.append($element);
            switch_tab(true);
            switch_tab(false);
            expect($element.logic.properties.audio.current_music).toBe(null);
        });

        it("a reconnect in a hidden tab waits too, and a return in a visible one plays", () => {
            const $element = connect_playing();
            const song = loaded("song.mp3");
            $element.remove();
            is_hidden = true;
            document.body.append($element);
            expect(song.paused).toBe(true);
            switch_tab(false);
            expect(song.paused).toBe(false);
        });
    });

    describe("a new game", () => {
        it("keeps the music running and the mutes as they are", () => {
            const $element = connect_playing();
            const audio = $element.logic.properties.audio;
            const song = loaded("song.mp3");
            audio.is_sound_muted = true;
            audio.is_music_muted = true;
            $element.restart();
            expect(song.plays).toBe(1);
            expect(song.paused).toBe(false);
            expect(audio.is_sound_muted).toBe(true);
            expect(audio.is_music_muted).toBe(true);
        });
    });

    describe("the autoplay rule without an intro", () => {
        it("plays a refused track from the first click or key on the element", async () => {
            FakeAudio.next_play = () => {
                const error = new Error("no gesture yet");
                error.name = "NotAllowedError";
                return Promise.reject(error);
            };
            const $element = connect_playing();
            await flush();
            const song = loaded("song.mp3");
            expect(song.paused).toBe(true);
            expect($element.logic.properties.audio.is_music_blocked).toBe(true);

            FakeAudio.next_play = () => Promise.resolve();
            $element.dispatchEvent(new Event("pointerdown"));
            await flush();
            expect(song.paused).toBe(false);
            expect($element.logic.properties.audio.is_music_blocked).toBe(
                false,
            );
        });
    });

    it("plays no track for a game that names none", () => {
        const $element = document.createElement(
            "test-sounds-no-music",
        ) as SilentElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        expect(loaded("bip.wav").plays).toBe(0);
        expect($element.logic.properties.audio.current_music).toBe(null);
    });

    it("loads nothing for a game that lists no sounds", () => {
        const $element = document.createElement(
            "test-sounds-plain",
        ) as PlainElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        expect(FakeAudio.created).toEqual([]);
        expect($element.logic.references.assets.audios.size).toBe(0);
        $element.remove();
    });
});
