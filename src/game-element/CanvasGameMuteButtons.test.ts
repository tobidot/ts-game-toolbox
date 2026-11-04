import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElementClickEvent } from "../ui/events";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings, MuteButtonsLayout } from "./CanvasGameSettings";

/** Stands in for `Audio`: jsdom plays nothing. */
class FakeAudio {
    public static created: FakeAudio[] = [];
    public paused = true;
    public ended = false;
    public muted = false;
    public volume = 1;
    public loop = false;
    public preload = "";
    public crossOrigin = "";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public currentTime = 0;

    public constructor(public src: string = "") {
        FakeAudio.created.push(this);
    }

    public addEventListener(): void {}

    public load(): void {}

    public play(): Promise<void> {
        this.paused = false;
        return Promise.resolve();
    }

    public pause(): void {
        this.paused = true;
    }
}

class FakeImage {
    public static created: FakeImage[] = [];
    public crossOrigin = "";
    public src = "";

    public constructor() {
        FakeImage.created.push(this);
    }

    public addEventListener(): void {}
}

const WITH_BUTTONS: MuteButtonsLayout = {
    width: 960,
    height: 640,
    sound_button: { left: 800, top: 10, width: 56, height: 56 },
    music_button: { left: 864, top: 10, width: 56, height: 56 },
};

class Settings extends CanvasGameSettings<MuteButtonsLayout> {
    public override readonly layouts: readonly MuteButtonsLayout[] = [
        WITH_BUTTONS,
    ];
    public override readonly sounds: Readonly<Record<string, string>> = {
        select: "select.wav",
        song: "song.mp3",
    };
    public override readonly music: string | null = "song";
}

class Renderer extends CanvasGameRenderer<object, Settings> {
    protected paint(): void {}
}

/** Counts what reaches the game, by key. */
class Logic extends CanvasGameLogic<object, Settings> {
    public readonly keys: string[] = [];

    protected create_game(): object {
        return {};
    }

    protected override on_key_press(event: KeyboardEvent): void {
        this.keys.push(event.key);
    }
}

/** An element over `settings`; each settings class needs its own element class. */
function element_class(settings: new () => Settings) {
    return class extends CanvasGameElement<Logic> {
        public readonly logic = this.assemble({
            settings,
            renderer: Renderer,
            logic: Logic,
        });
    };
}

class NoMusicSettings extends Settings {
    public override readonly sounds = { select: "select.wav" };
    public override readonly music = null;
}

class OnlyMusicSettings extends Settings {
    public override readonly sounds = { song: "song.mp3" };
}

class NoSoundSettings extends Settings {
    public override readonly sounds = {};
    public override readonly music = null;
}

class NotPlacedSettings extends Settings {
    public override readonly layouts = [{ width: 960, height: 640 }];
}

class OtherKeysSettings extends Settings {
    public override readonly sound_mute_key = "t";
    public override readonly music_mute_key = null;
}

class NoSelectSettings extends Settings {
    public override readonly sounds = { bip: "bip.wav", song: "song.mp3" };
}

/** A wide layout with the buttons, an upright one without. */
class TwoLayoutsSettings extends Settings {
    public override readonly layouts = [
        WITH_BUTTONS,
        { width: 600, height: 960 },
    ];
}

type ElementName =
    | "test-mute-both"
    | "test-mute-no-music"
    | "test-mute-only-music"
    | "test-mute-no-sound"
    | "test-mute-not-placed"
    | "test-mute-other-keys"
    | "test-mute-no-select"
    | "test-mute-two-layouts";
customElements.define("test-mute-both", element_class(Settings));
customElements.define("test-mute-no-music", element_class(NoMusicSettings));
customElements.define("test-mute-only-music", element_class(OnlyMusicSettings));
customElements.define("test-mute-no-sound", element_class(NoSoundSettings));
customElements.define("test-mute-not-placed", element_class(NotPlacedSettings));
customElements.define("test-mute-other-keys", element_class(OtherKeysSettings));
customElements.define("test-mute-no-select", element_class(NoSelectSettings));
customElements.define(
    "test-mute-two-layouts",
    element_class(TwoLayoutsSettings),
);

describe("the shell's mute buttons", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;

    function run_frames(count: number = 1): void {
        for (let frame = 0; frame < count; frame++) {
            time_ms += 100;
            const due = frames;
            frames = [];
            for (const callback of due) {
                callback(time_ms);
            }
        }
    }

    beforeEach(() => {
        FakeAudio.created = [];
        FakeImage.created = [];
        frames = [];
        vi.stubGlobal("Audio", FakeAudio);
        vi.stubGlobal("Image", FakeImage);
        vi.stubGlobal(
            "requestAnimationFrame",
            (callback: FrameRequestCallback) => {
                frames.push(callback);
                return frames.length;
            },
        );
        vi.stubGlobal("cancelAnimationFrame", () => {});
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

    function connect(name: ElementName) {
        const $element = document.createElement(
            name,
        ) as CanvasGameElement<Logic>;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        return $element;
    }

    function press_key(
        $element: HTMLElement,
        key: string,
        repeat = false,
    ): void {
        $element.dispatchEvent(new KeyboardEvent("keydown", { key, repeat }));
    }

    /** The channels are the audio elements after the loaded sounds. */
    function sounds_played(): number {
        return FakeAudio.created.filter(
            ($audio) => !$audio.paused && !$audio.loop,
        ).length;
    }

    describe("which buttons a game gets", () => {
        it("sounds and music, both placed: both, where the layout says", () => {
            const { properties } = connect("test-mute-both").logic;
            expect(properties.sound_button?.rect.left).toBe(800);
            expect(properties.sound_button?.rect.width).toBe(56);
            expect(properties.music_button?.rect.left).toBe(864);
            expect(properties.page.children).toContain(properties.sound_button);
            expect(properties.page.children).toContain(properties.music_button);
        });

        it("sounds without music: only the sound button, though the layout has both", () => {
            const { properties } = connect("test-mute-no-music").logic;
            expect(properties.sound_button).not.toBeNull();
            expect(properties.music_button).toBeNull();
        });

        it("a track and no other sound: only the music button", () => {
            const { properties } = connect("test-mute-only-music").logic;
            expect(properties.sound_button).toBeNull();
            expect(properties.music_button).not.toBeNull();
        });

        it("silence: none, and no icon is loaded", () => {
            const { properties, references } =
                connect("test-mute-no-sound").logic;
            expect(properties.sound_button).toBeNull();
            expect(properties.music_button).toBeNull();
            expect(references.assets.images.size).toBe(0);
        });

        it("no rect in any layout: none, and the letters stay the game's", () => {
            const $element = connect("test-mute-not-placed");
            const { properties } = $element.logic;
            expect(properties.sound_button).toBeNull();
            expect(properties.music_button).toBeNull();
            press_key($element, "s");
            press_key($element, "m");
            expect($element.logic.keys).toEqual(["s", "m"]);
            expect(properties.audio.is_sound_muted).toBe(false);
        });
    });

    describe("the icons", () => {
        it("load with the game, one for each button, and the game lists none", () => {
            const { properties, references } = connect("test-mute-both").logic;
            expect(references.assets.images.size).toBe(2);
            expect(properties.sound_button?.icon?.url).toMatch(
                /^data:image\/png/,
            );
            expect(properties.music_button?.icon?.url).toMatch(
                /^data:image\/png/,
            );
            expect(properties.sound_button?.icon).not.toBe(
                properties.music_button?.icon,
            );
        });

        it("load once, whatever the connections", () => {
            const $element = connect("test-mute-both");
            const count = FakeImage.created.length;
            $element.remove();
            document.body.append($element);
            expect(FakeImage.created.length).toBe(count);
        });
    });

    describe("a click", () => {
        function click(
            $element: CanvasGameElement<Logic>,
            name: "sound_button" | "music_button",
        ): void {
            const button = $element.logic.properties[name];
            if (button !== null) {
                button.events.dispatch(new ElementClickEvent(button));
            }
        }

        it("mutes the sounds and back, and the button shows it at the next repaint", () => {
            const $element = connect("test-mute-both");
            const { properties } = $element.logic;
            run_frames();
            expect(properties.sound_button?.is_off).toBe(false);
            click($element, "sound_button");
            expect(properties.audio.is_sound_muted).toBe(true);
            run_frames();
            expect(properties.sound_button?.is_off).toBe(true);
            expect(properties.music_button?.is_off).toBe(false);
            click($element, "sound_button");
            run_frames();
            expect(properties.audio.is_sound_muted).toBe(false);
            expect(properties.sound_button?.is_off).toBe(false);
        });

        it("mutes the music, which runs on", () => {
            const $element = connect("test-mute-both");
            const song = FakeAudio.created.find(
                ($audio) => $audio.src === "song.mp3",
            );
            click($element, "music_button");
            run_frames();
            expect($element.logic.properties.audio.is_music_muted).toBe(true);
            expect($element.logic.properties.music_button?.is_off).toBe(true);
            expect(song?.muted).toBe(true);
            expect(song?.paused).toBe(false);
        });

        it("still works after a reconnect, once per click", () => {
            const $element = connect("test-mute-both");
            $element.remove();
            document.body.append($element);
            click($element, "sound_button");
            expect($element.logic.properties.audio.is_sound_muted).toBe(true);
        });

        it("answers with `select`, not while the sounds just went off", () => {
            const $element = connect("test-mute-both");
            click($element, "sound_button");
            expect(sounds_played()).toBe(0);
            click($element, "sound_button");
            expect(sounds_played()).toBe(1);
        });

        it("is silent in a game without `select`, and warns about nothing", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const $element = connect("test-mute-no-select");
            click($element, "music_button");
            expect(sounds_played()).toBe(0);
            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe("the keys", () => {
        it("S and M do what the buttons do, in either case, and never reach the game", () => {
            const $element = connect("test-mute-both");
            const { audio } = $element.logic.properties;
            press_key($element, "s");
            expect(audio.is_sound_muted).toBe(true);
            press_key($element, "S");
            expect(audio.is_sound_muted).toBe(false);
            press_key($element, "m");
            expect(audio.is_music_muted).toBe(true);
            expect($element.logic.keys).toEqual([]);
        });

        it("a held key counts once", () => {
            const $element = connect("test-mute-both");
            const { audio } = $element.logic.properties;
            press_key($element, "s");
            press_key($element, "s", true);
            press_key($element, "s", true);
            expect(audio.is_sound_muted).toBe(true);
        });

        it("other keys go to the game", () => {
            const $element = connect("test-mute-both");
            press_key($element, "x");
            expect($element.logic.keys).toEqual(["x"]);
        });

        it("a game that needs the letters names others, or none", () => {
            const $element = connect("test-mute-other-keys");
            const { audio } = $element.logic.properties;
            press_key($element, "s");
            press_key($element, "m");
            expect(audio.is_sound_muted).toBe(false);
            expect(audio.is_music_muted).toBe(false);
            expect($element.logic.keys).toEqual(["s", "m"]);
            press_key($element, "t");
            expect(audio.is_sound_muted).toBe(true);
        });

        it("the sound key does nothing in a game with only a track", () => {
            const $element = connect("test-mute-only-music");
            press_key($element, "s");
            expect($element.logic.properties.audio.is_sound_muted).toBe(false);
            expect($element.logic.keys).toEqual(["s"]);
        });

        it("ignored during the intro", () => {
            const $element = document.createElement(
                "test-mute-both",
            ) as CanvasGameElement<Logic>;
            document.body.append($element);
            $element.logic.properties.intro.leave();
            press_key($element, "s");
            expect($element.logic.properties.audio.is_sound_muted).toBe(false);
        });
    });

    describe("a mute changed from outside", () => {
        it("shows on the button at the next repaint", () => {
            const { properties } = connect("test-mute-both").logic;
            properties.audio.is_sound_muted = true;
            properties.is_dirty = true;
            run_frames();
            expect(properties.sound_button?.is_off).toBe(true);
        });
    });

    describe("a layout without the rect", () => {
        it("hides the button and sends its letter to the game", () => {
            const $element = connect("test-mute-two-layouts");
            const { properties } = $element.logic;
            const button = properties.sound_button;
            expect(button?.is_visible).toBe(true);
            properties.place_widgets({ width: 600, height: 960 });
            expect(button?.is_visible).toBe(false);
            press_key($element, "s");
            expect(properties.audio.is_sound_muted).toBe(false);
            expect($element.logic.keys).toEqual(["s"]);
            properties.place_widgets(WITH_BUTTONS);
            expect(button?.is_visible).toBe(true);
            expect(button?.rect.left).toBe(800);
        });
    });
});
