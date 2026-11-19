/* eslint-disable @typescript-eslint/naming-convention -- frame numbers as keys, as a catalogue entry writes them */
import { describe, expect, it } from "vitest";
import { AnimationClip, parse_frames } from "./AnimationClip";
import {
    AnimationEndEvent,
    AnimationFrameEvent,
    AnimationPlayer,
} from "./AnimationPlayer";
import { SheetData } from "./SheetData";
import { SpriteSheet } from "./SpriteSheet";

/** A picture of `width` by `height` that only says its size. */
function picture(width: number, height: number): CanvasImageSource {
    return { width, height } as unknown as CanvasImageSource;
}

/** Eight frames in one row: walk 0-7 at 12 fps, a jump that goes back to idle, a ping-pong. */
function test_sheet(): SpriteSheet {
    return SpriteSheet.grid(picture(256, 64), 32, 32).add_clips(
        {
            idle: { frames: "8-9", fps: 4, loop: true },
            walk: {
                frames: "0-7",
                fps: 12,
                loop: true,
                events: { 1: "step", 5: "step" },
            },
            jump: { frames: "10-13", fps: 10, then: "idle" },
            wave: { frames: "0-3", fps: 10 },
            swing: { frames: "0-3", fps: 10, loop: "ping-pong" },
            beat: {
                frames: "0-3",
                fps: 10,
                loop: true,
                events: { 1: "step", 3: "step" },
            },
        },
        "idle",
    );
}

/** The names of the frame events a player sends, in order. */
function record_steps(player: AnimationPlayer): string[] {
    const heard: string[] = [];
    player.events.attach(AnimationFrameEvent, (event) => {
        heard.push(`${event.clip}:${event.frame_index}:${event.name}`);
    });
    return heard;
}

/** Runs `seconds` in steps of `step`, as a game loop does. */
function run(player: AnimationPlayer, seconds: number, step: number): void {
    let left = seconds;
    while (left > 1e-9) {
        const delta = Math.min(step, left);
        player.update(delta);
        left -= delta;
    }
}

describe("parse_frames", () => {
    it("reads ranges, single cells and lists", () => {
        expect(parse_frames("0-3")).toEqual([0, 1, 2, 3]);
        expect(parse_frames("7-5")).toEqual([7, 6, 5]);
        expect(parse_frames("0-2, 5, 8-9")).toEqual([0, 1, 2, 5, 8, 9]);
        expect(parse_frames("4")).toEqual([4]);
        expect(parse_frames([3, 1, 2])).toEqual([3, 1, 2]);
    });

    it("refuses what is no frame", () => {
        expect(() => parse_frames("a-b")).toThrow();
        expect(() => parse_frames("")).toThrow();
        expect(() => parse_frames([-1])).toThrow();
        expect(() => parse_frames([])).toThrow();
    });
});

describe("AnimationClip", () => {
    it("takes the catalogue's data as it is", () => {
        const clip = AnimationClip.from_data("walk", {
            frames: "135-157",
            row: 9,
            fps: 12.27,
            loop: true,
            events: { "9": "step", "13": "step" },
        });
        expect(clip.frames.length).toBe(23);
        expect(clip.frames[0]).toBe(135);
        expect(clip.mode).toBe("loop");
        expect(clip.events.get(9)).toBe("step");
        expect(clip.duration).toBeCloseTo(23 / 12.27);
    });

    it("plays 12 fps without a word, once without loop, and per-frame durations", () => {
        const once = AnimationClip.from_data("a", { frames: "0-1" });
        expect(once.mode).toBe("once");
        expect(once.durations).toEqual([1 / 12, 1 / 12]);
        const timed = AnimationClip.from_data("b", {
            frames: "0-2",
            fps: 10,
            durations: [0.5],
        });
        expect(timed.durations).toEqual([0.5, 0.1, 0.1]);
        expect(
            AnimationClip.from_data("c", { frames: "0-2", loop: "ping-pong" })
                .duration,
        ).toBeCloseTo(4 / 12);
    });

    it("refuses a clip that would never move on, and events past its end", () => {
        expect(() =>
            AnimationClip.from_data("a", { frames: "0-1", fps: 0 }),
        ).toThrow();
        expect(() =>
            AnimationClip.from_data("a", {
                frames: "0-1",
                durations: [0.1, 0],
            }),
        ).toThrow();
        expect(() =>
            AnimationClip.from_data("a", {
                frames: "0-1",
                events: { 2: "step" },
            }),
        ).toThrow();
    });
});

describe("SpriteSheet", () => {
    it("cuts a grid row by row, with margin and spacing", () => {
        const sheet = SpriteSheet.grid(
            picture(2 + 3 * 10 + 2 * 1, 24),
            10,
            10,
            {
                margin: 1,
                spacing: 1,
            },
        );
        expect(sheet.frames.length).toBe(6);
        expect(sheet.frames[0]).toEqual({
            left: 1,
            top: 1,
            width: 10,
            height: 10,
        });
        expect(sheet.frames[2]).toEqual({
            left: 23,
            top: 1,
            width: 10,
            height: 10,
        });
        expect(sheet.frames[4]).toEqual({
            left: 12,
            top: 12,
            width: 10,
            height: 10,
        });
    });

    it("cuts a grid without a picture when it is told the columns and rows, and stops at count", () => {
        const sheet = SpriteSheet.grid(null, 16, 8, {
            columns: 4,
            rows: 3,
            count: 10,
        });
        expect(sheet.frames.length).toBe(10);
        expect(sheet.frames[9]).toEqual({
            left: 16,
            top: 16,
            width: 16,
            height: 8,
        });
        expect(sheet.is_ready).toBe(false);
        expect(() => SpriteSheet.grid(null, 16, 8)).toThrow();
    });

    it("takes packed frames as they are", () => {
        const sheet = SpriteSheet.from_frames(picture(64, 64), [
            { left: 0, top: 0, width: 20, height: 30 },
            { left: 20, top: 0, width: 44, height: 30 },
        ]);
        expect(sheet.frames.length).toBe(2);
        expect(sheet.is_ready).toBe(true);
    });

    it("keeps an anchor per packed frame, the sheet's anchor for frames without one", () => {
        const sheet = SpriteSheet.from_frames(
            picture(64, 64),
            [
                {
                    left: 0,
                    top: 0,
                    width: 20,
                    height: 30,
                    anchor: { x: 4, y: 28 },
                },
                { left: 20, top: 0, width: 44, height: 30 },
            ],
            { x: 22, y: 29 },
        );
        expect(sheet.frames[0]).toEqual({
            left: 0,
            top: 0,
            width: 20,
            height: 30,
        });
        expect(sheet.anchor_of(0)).toEqual({ x: 4, y: 28 });
        expect(sheet.anchor_of(1)).toEqual({ x: 22, y: 29 });
        const draws: number[][] = [];
        const context = {
            drawImage: (_image: unknown, ...rest: number[]) => {
                draws.push(rest);
            },
        } as unknown as CanvasRenderingContext2D;
        sheet.draw_frame(context, 0, 100, 100);
        sheet.draw_frame(context, 1, 100, 100);
        // Each frame's own anchor lands on 100, 100.
        expect(draws[0].slice(4, 6)).toEqual([96, 72]);
        expect(draws[1].slice(4, 6)).toEqual([78, 71]);
        // Without a sheet anchor, a frame without its own is drawn around its middle.
        const middle = SpriteSheet.from_frames(picture(64, 64), [
            { left: 0, top: 0, width: 20, height: 30 },
            { left: 20, top: 0, width: 44, height: 30, anchor: { x: 1, y: 2 } },
        ]);
        expect(middle.anchor_of(0)).toBeNull();
        expect(middle.anchor_of(1)).toEqual({ x: 1, y: 2 });
        // New data forgets the packed anchors.
        middle.set_data({ frame_width: 32, frame_height: 32, columns: 2 });
        expect(middle.anchor_of(1)).toBeNull();
    });

    it("builds itself from a catalogue entry's sheet data", () => {
        const data: SheetData = {
            frame_width: 132,
            frame_height: 128,
            columns: 15,
            rows: 16,
            anchor: { x: 66, y: 124 },
            default: "idle",
            clips: {
                idle: { frames: "0-33", row: 0, fps: 12.18, loop: true },
                wave: {
                    frames: "75-129",
                    row: 5,
                    fps: 12.11,
                    loop: false,
                    then: "idle",
                },
            },
        };
        const sheet = SpriteSheet.from_data(null, data);
        expect(sheet.frames.length).toBe(240);
        expect(sheet.frames[16]).toEqual({
            left: 132,
            top: 128,
            width: 132,
            height: 128,
        });
        expect(sheet.anchor).toEqual({ x: 66, y: 124 });
        expect(sheet.default_clip).toBe("idle");
        expect(sheet.clip("wave")?.then).toBe("idle");
        expect(sheet.clip("nope")).toBeNull();
    });

    it("draws a frame with its anchor on the point, mirrored on request", () => {
        const sheet = SpriteSheet.grid(picture(64, 32), 32, 32, {
            anchor: { x: 16, y: 30 },
        });
        const calls: unknown[][] = [];
        const context = {
            drawImage: (...args: unknown[]) => {
                calls.push(["drawImage", ...args.slice(1)]);
            },
            save: () => calls.push(["save"]),
            restore: () => calls.push(["restore"]),
            translate: (x: number, y: number) =>
                calls.push(["translate", x, y]),
            scale: (x: number, y: number) => calls.push(["scale", x, y]),
        } as unknown as CanvasRenderingContext2D;
        expect(sheet.draw_frame(context, 1, 100, 200)).toBe(true);
        expect(calls).toEqual([["drawImage", 32, 0, 32, 32, 84, 170, 32, 32]]);
        calls.length = 0;
        sheet.draw_frame(context, 0, 100, 200, { scale: 2, flip_x: true });
        expect(calls).toEqual([
            ["save"],
            ["translate", 100, 200],
            ["scale", -1, 1],
            ["drawImage", 0, 0, 32, 32, -32, -60, 64, 64],
            ["restore"],
        ]);
        expect(sheet.draw_frame(context, 9, 0, 0)).toBe(false);
    });

    it("draws from a smaller copy of its picture once prescaled, at the same size", () => {
        const made: Array<{
            width: number;
            height: number;
            draws: unknown[][];
        }> = [];
        const make_canvas = (width: number, height: number) => {
            const draws: unknown[][] = [];
            made.push({ width, height, draws });
            return {
                width,
                height,
                getContext: () => ({
                    imageSmoothingEnabled: false,
                    imageSmoothingQuality: "low",
                    drawImage: (...args: unknown[]) => draws.push(args),
                }),
            } as unknown as HTMLCanvasElement;
        };
        const original = picture(264, 128);
        const sheet = SpriteSheet.grid(original, 132, 128, {
            anchor: { x: 66, y: 124 },
        });
        expect(sheet.picture_scale).toBe(1);
        expect(sheet.prescale(0.25, make_canvas)).toBe(true);
        expect(made).toHaveLength(1);
        expect([made[0].width, made[0].height]).toEqual([66, 32]);
        expect(made[0].draws[0]).toEqual([original, 0, 0, 66, 32]);
        expect(sheet.picture_scale).toBe(0.25);
        // frames and anchors stay in the first picture's pixels
        expect(sheet.frames[1]).toEqual({
            left: 132,
            top: 0,
            width: 132,
            height: 128,
        });
        const draws: number[][] = [];
        const context = {
            drawImage: (_image: unknown, ...rest: number[]) => {
                draws.push(rest);
            },
        } as unknown as CanvasRenderingContext2D;
        sheet.draw_frame(context, 1, 100, 200, { scale: 0.5 });
        // the source from the small copy, the place and size as before
        expect(draws[0]).toEqual([33, 0, 33, 32, 67, 138, 66, 64]);
        // new data keeps counting in the first picture's pixels
        sheet.set_data({ frame_width: 132, frame_height: 64, columns: 2 });
        expect(sheet.frames.length).toBe(4);
        // a new picture is drawn as it is
        sheet.image = picture(264, 128);
        expect(sheet.picture_scale).toBe(1);
        // only smaller, and only with a picture
        expect(sheet.prescale(1.5, make_canvas)).toBe(false);
        expect(new SpriteSheet().prescale(0.5, make_canvas)).toBe(false);
    });

    it("draws around the middle of the frame without an anchor, and nothing without a picture", () => {
        const sheet = SpriteSheet.grid(picture(32, 32), 32, 32);
        const draws: number[][] = [];
        const context = {
            drawImage: (_image: unknown, ...rest: number[]) => {
                draws.push(rest);
            },
        } as unknown as CanvasRenderingContext2D;
        sheet.draw_frame(context, 0, 50, 50);
        expect(draws[0].slice(4)).toEqual([34, 34, 32, 32]);
        sheet.image = null;
        expect(sheet.draw_frame(context, 0, 50, 50)).toBe(false);
    });
});

describe("AnimationPlayer", () => {
    it("shows the frame due after n seconds at 12 fps, and loops", () => {
        const player = test_sheet().player("walk");
        player.update(0.25 + 1e-9);
        expect(player.frame_index).toBe(3);
        expect(player.frame).toBe(3);
        player.update(0.75);
        expect(player.frame_index).toBe(4);
    });

    it("needs half the time at speed 2", () => {
        const slow = test_sheet().player("walk");
        const fast = test_sheet().player("walk");
        fast.speed = 2;
        run(slow, 0.5 + 1e-6, 1 / 60);
        run(fast, 0.25 + 1e-6, 1 / 60);
        expect(fast.frame_index).toBe(slow.frame_index);
        expect(fast.frame_index).toBe(6);
    });

    it("stops a clip played once on its last frame", () => {
        const player = test_sheet().player("wave");
        player.update(0.35);
        expect(player.frame_index).toBe(3);
        expect(player.finished).toBe(false);
        player.update(5);
        expect(player.frame_index).toBe(3);
        expect(player.frame).toBe(3);
        expect(player.finished).toBe(true);
    });

    it("follows `then` when a clip played once ends, carrying the time over", () => {
        const player = test_sheet().player("jump");
        const ends: string[] = [];
        player.events.attach(AnimationEndEvent, (event) => {
            ends.push(`${event.clip}>${event.next}`);
        });
        player.update(0.39);
        expect(player.clip_name).toBe("jump");
        player.update(0.01 + 1e-9);
        expect(player.clip_name).toBe("idle");
        expect(player.frame_index).toBe(0);
        player.update(0.25);
        expect(player.frame_index).toBe(1);
        expect(player.finished).toBe(false);
        expect(ends).toEqual(["jump>idle"]);
    });

    it("turns at both ends in ping-pong", () => {
        const player = test_sheet().player("swing");
        const seen: number[] = [player.frame_index];
        for (let step = 0; step < 9; step++) {
            player.update(0.1 + 1e-9);
            seen.push(player.frame_index);
        }
        expect(seen).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
    });

    it("starts a queued clip exactly when the current one ends", () => {
        const player = test_sheet().player("beat");
        const ends: string[] = [];
        player.events.attach(AnimationEndEvent, (event) => {
            ends.push(`${event.clip}>${event.next}`);
        });
        player.update(0.15);
        player.queue("jump");
        expect(player.queued).toBe("jump");
        player.update(0.24);
        expect(player.clip_name).toBe("beat");
        expect(player.frame_index).toBe(3);
        player.update(0.01 + 1e-9);
        expect(player.clip_name).toBe("jump");
        expect(player.frame_index).toBe(0);
        expect(player.queued).toBeNull();
        expect(ends).toEqual(["beat>jump"]);
    });

    it("queues after a clip played once instead of its `then`, and starts at once when nothing plays", () => {
        const player = test_sheet().player("jump");
        player.queue("walk");
        player.update(0.4 + 1e-9);
        expect(player.clip_name).toBe("walk");
        const done = test_sheet().player("wave");
        done.update(1);
        expect(done.finished).toBe(true);
        done.queue("walk");
        expect(done.clip_name).toBe("walk");
        expect(done.finished).toBe(false);
    });

    it("plays at once and drops the queue; the same clip again goes on unless restarted", () => {
        const player = test_sheet().player("walk");
        player.update(0.25 + 1e-9);
        player.queue("jump");
        expect(player.play("walk")).toBe(true);
        expect(player.frame_index).toBe(3);
        expect(player.queued).toBe("jump");
        player.play("walk", { restart: true });
        expect(player.frame_index).toBe(0);
        expect(player.play("wave")).toBe(true);
        expect(player.clip_name).toBe("wave");
        expect(player.queued).toBeNull();
        expect(player.play("nope")).toBe(false);
        expect(player.clip_name).toBe("wave");
    });

    it("sends each named frame's event once, also when one update skips several frames", () => {
        const player = test_sheet().player("beat");
        const heard = record_steps(player);
        player.update(1 + 1e-9);
        expect(player.frame_index).toBe(2);
        expect(heard).toEqual([
            "beat:1:step",
            "beat:3:step",
            "beat:1:step",
            "beat:3:step",
            "beat:1:step",
        ]);
    });

    it("sends as many footsteps at every speed for the same frames shown", () => {
        for (const speed of [0.1, 0.5, 1, 2, 3, 17]) {
            const player = test_sheet().player("walk");
            player.speed = speed;
            const heard = record_steps(player);
            // three full cycles of 8 frames at 12 fps, in uneven frames
            run(player, 2 / speed + 1e-6, 1 / 45);
            expect(heard.length).toBe(6);
        }
    });

    it("sends the first frame's event when a clip starts", () => {
        const sheet = test_sheet().add_clips({
            hop: { frames: "0-1", fps: 10, loop: true, events: { 0: "land" } },
        });
        const player = sheet.player("hop");
        const heard = record_steps(player);
        player.update(0);
        expect(heard).toEqual(["hop:0:land"]);
        player.update(0.2 + 1e-9);
        expect(heard).toEqual(["hop:0:land", "hop:0:land"]);
    });

    it("stands still while paused or at speed 0", () => {
        const player = test_sheet().player("walk");
        player.paused = true;
        player.update(1);
        expect(player.frame_index).toBe(0);
        player.paused = false;
        player.speed = 0;
        player.update(1);
        expect(player.frame_index).toBe(0);
    });

    it("plays the sheet's default clip, or the first, when it is not told one", () => {
        expect(test_sheet().player().clip_name).toBe("idle");
        const sheet = SpriteSheet.grid(null, 8, 8, { columns: 4, rows: 1 });
        sheet.add_clips({ spin: { frames: "0-3" } });
        expect(sheet.player().clip_name).toBe("spin");
    });

    it("waits for a sheet whose data comes later, then plays what it was told", () => {
        const sheet = new SpriteSheet();
        const waiting = sheet.player();
        const told = sheet.player("walk");
        waiting.update(0.5);
        expect(waiting.frame).toBe(-1);
        expect(told.clip_name).toBe("walk");
        expect(told.clip).toBeNull();
        sheet.set_data({
            frame_width: 32,
            frame_height: 32,
            columns: 8,
            rows: 2,
            default: "idle",
            clips: {
                idle: { frames: "8-9", fps: 4, loop: true },
                walk: { frames: "0-7", fps: 12, loop: true },
            },
        });
        waiting.update(0);
        told.update(0.25 + 1e-9);
        expect(waiting.clip_name).toBe("idle");
        expect(waiting.frame).toBe(8);
        expect(told.clip_name).toBe("walk");
        expect(told.frame_index).toBe(3);
    });

    it("draws its frame through the sheet", () => {
        const player = test_sheet().player("walk");
        player.update(0.25 + 1e-9);
        const sources: number[] = [];
        const context = {
            drawImage: (_image: unknown, left: number) => {
                sources.push(left);
            },
        } as unknown as CanvasRenderingContext2D;
        expect(player.draw(context, 0, 0)).toBe(true);
        expect(sources).toEqual([96]);
    });
});
