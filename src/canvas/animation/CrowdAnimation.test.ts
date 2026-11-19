/* eslint-disable @typescript-eslint/naming-convention -- frame numbers as keys, as a catalogue entry writes them */
import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random/SeededRandom";
import { SpriteBatch } from "../SpriteBatch";
import { AnimationFrameEvent, AnimationPlayer } from "./AnimationPlayer";
import { CrowdAnimation, CrowdFrameEvent } from "./CrowdAnimation";
import { SheetData } from "./SheetData";
import { SpriteSheet } from "./SpriteSheet";

/** A picture that only says its size. */
const PICTURE = { width: 256, height: 64 } as unknown as CanvasImageSource;

/** The cabbage kid's clips in small: a loop with footsteps, a wave that goes back to idle, a ping-pong. */
const DATA: SheetData = {
    frame_width: 32,
    frame_height: 32,
    columns: 8,
    rows: 2,
    anchor: { x: 16, y: 30 },
    default: "idle",
    clips: {
        idle: { frames: "0-3", fps: 12.18, loop: true },
        walk: {
            frames: "4-11",
            fps: 12.27,
            loop: true,
            events: { 1: "step", 5: "step" },
        },
        wave: { frames: "12-14", fps: 12.11, then: "idle" },
        swing: { frames: "0-4", fps: 9, loop: "ping-pong" },
        stop: { frames: "5-7", fps: 10 },
    },
};

function sheet(): SpriteSheet {
    return SpriteSheet.from_data(PICTURE, DATA);
}

const CLIPS = ["idle", "walk", "wave", "swing", "stop"] as const;

describe("CrowdAnimation", () => {
    it("shows 1 000 members frame for frame as 1 000 single players would", () => {
        const shared = sheet();
        const crowd = new CrowdAnimation(shared, 16);
        const players: AnimationPlayer[] = [];
        const random = new SeededRandom(4711);
        for (let index = 0; index < 1000; index++) {
            const clip = CLIPS[index % CLIPS.length];
            const speed = random.float(0.5, 2);
            const time = random.float(0, 0.4);
            expect(crowd.add(clip, { speed, time })).toBe(index);
            const player = shared.player(clip);
            player.update(time);
            player.speed = speed;
            players.push(player);
        }
        expect(crowd.count).toBe(1000);
        for (let step = 0; step < 400; step++) {
            const delta = random.float(0.001, 0.05);
            if (step === 150) {
                for (let index = 0; index < 1000; index += 7) {
                    crowd.play(index, "wave");
                    players[index].play("wave");
                }
            }
            if (step === 260) {
                for (let index = 3; index < 1000; index += 11) {
                    crowd.play(index, "walk", { restart: true });
                    players[index].play("walk", { restart: true });
                }
            }
            crowd.update(delta);
            for (const player of players) {
                player.update(delta);
            }
            for (let index = 0; index < 1000; index++) {
                const player = players[index];
                if (
                    crowd.frame_of(index) !== player.frame ||
                    crowd.clip_of(index) !== player.clip_name ||
                    crowd.frame_index_of(index) !== player.frame_index ||
                    crowd.is_finished(index) !== player.finished
                ) {
                    expect(
                        `${crowd.clip_of(index)} ${crowd.frame_of(index)}`,
                        `member ${index} after step ${step}`,
                    ).toBe(`${player.clip_name} ${player.frame}`);
                }
            }
        }
    });

    it("starts members at seeded random times, so a crowd doesn't walk in step", () => {
        const make = (seed: number) => {
            const crowd = new CrowdAnimation(sheet(), 64, {
                random: new SeededRandom(seed),
            });
            for (let index = 0; index < 50; index++) {
                crowd.add("walk");
            }
            crowd.update(0.2);
            return Array.from({ length: 50 }, (_, index) =>
                crowd.frame_of(index),
            );
        };
        const first = make(7);
        expect(make(7)).toEqual(first);
        expect(make(8)).not.toEqual(first);
        // spread over the clip: most of the walk's eight frames are shown
        expect(new Set(first).size).toBeGreaterThanOrEqual(6);
        // a start time of 0 starts on the first frame
        const crowd = new CrowdAnimation(sheet(), 4);
        crowd.add("walk", { time: 0 });
        expect(crowd.frame_of(0)).toBe(4);
    });

    it("sends the footsteps a player would, with the member, and none when events are off", () => {
        const shared = sheet();
        const loud = new CrowdAnimation(shared, 8);
        const quiet = new CrowdAnimation(shared, 8, { events: false });
        const player = shared.player("walk");
        const steps: string[] = [];
        const heard: string[] = [];
        let quiet_heard = 0;
        loud.events.attach(CrowdFrameEvent, (event) => {
            steps.push(`${event.member}:${event.clip}:${event.frame_index}`);
        });
        quiet.events.attach(CrowdFrameEvent, () => {
            quiet_heard += 1;
        });
        player.events.attach(AnimationFrameEvent, (event) => {
            heard.push(`1:${event.clip}:${event.frame_index}`);
        });
        loud.add("idle", { time: 0 });
        loud.add("walk", { time: 0 });
        quiet.add("walk", { time: 0 });
        for (let step = 0; step < 120; step++) {
            loud.update(1 / 60);
            quiet.update(1 / 60);
            player.update(1 / 60);
        }
        expect(heard.length).toBeGreaterThan(4);
        expect(steps).toEqual(heard);
        expect(quiet_heard).toBe(0);
        // and a player can be quiet too
        player.sends_events = false;
        heard.length = 0;
        for (let step = 0; step < 120; step++) {
            player.update(1 / 60);
        }
        expect(heard).toEqual([]);
    });

    it("removes a member by moving the last one into its place", () => {
        const crowd = new CrowdAnimation(sheet(), 4);
        crowd.add("idle", { time: 0 });
        crowd.add("walk", { time: 0, speed: 2 });
        crowd.add("wave", { time: 0, flip_x: true, scale: 0.5 });
        expect(crowd.remove(0)).toBe(2);
        expect(crowd.count).toBe(2);
        expect(crowd.clip_of(0)).toBe("wave");
        expect(crowd.is_flipped(0)).toBe(true);
        expect(crowd.scale_of(0)).toBe(0.5);
        expect(crowd.clip_of(1)).toBe("walk");
        expect(crowd.speed_of(1)).toBe(2);
        // the last one goes without a move
        expect(crowd.remove(1)).toBe(-1);
        expect(crowd.count).toBe(1);
        expect(() => crowd.remove(5)).toThrow();
    });

    it("grows past its first capacity and keeps what it holds", () => {
        const crowd = new CrowdAnimation(sheet(), 2);
        for (let index = 0; index < 100; index++) {
            crowd.add(index % 2 === 0 ? "walk" : "idle", {
                time: 0,
                speed: index,
            });
        }
        expect(crowd.count).toBe(100);
        expect(crowd.capacity).toBeGreaterThanOrEqual(100);
        expect(crowd.speed_of(99)).toBe(99);
        expect(crowd.clip_of(98)).toBe("walk");
        crowd.clear();
        expect(crowd.count).toBe(0);
    });

    it("plays like a player: the clip playing goes on, a restart starts over, an unknown clip is refused", () => {
        const crowd = new CrowdAnimation(sheet(), 4);
        crowd.add("walk", { time: 0 });
        crowd.update(0.2);
        const frame = crowd.frame_of(0);
        expect(crowd.play(0, "walk")).toBe(true);
        expect(crowd.frame_of(0)).toBe(frame);
        crowd.play(0, "walk", { restart: true });
        expect(crowd.frame_of(0)).toBe(4);
        expect(crowd.play(0, "fly")).toBe(false);
        expect(crowd.clip_of(0)).toBe("walk");
        // a clip played once goes on with its `then`
        crowd.play(0, "wave");
        crowd.update(0.3);
        expect(crowd.clip_of(0)).toBe("idle");
        // one played once without `then` stops on its last frame
        crowd.play(0, "stop");
        crowd.update(1);
        expect(crowd.is_finished(0)).toBe(true);
        expect(crowd.frame_of(0)).toBe(7);
    });

    it("waits for a sheet whose data comes later, then starts at the asked time", () => {
        const empty = new SpriteSheet();
        const crowd = new CrowdAnimation(empty, 4);
        crowd.add("walk", { time: 0.25 });
        crowd.add("idle");
        expect(crowd.frame_of(0)).toBe(-1);
        crowd.update(0.1);
        expect(crowd.frame_of(0)).toBe(-1);
        empty.image = PICTURE;
        empty.set_data(DATA);
        crowd.update(0);
        const player = empty.player("walk");
        player.update(0.25);
        expect(crowd.frame_of(0)).toBe(player.frame);
        expect(crowd.clip_of(1)).toBe("idle");
        expect(crowd.frame_of(1)).toBeGreaterThanOrEqual(0);
    });

    it("draws every member through a batch, in the order asked, flipped and scaled", () => {
        const shared = sheet();
        const crowd = new CrowdAnimation(shared, 4);
        crowd.add("idle", { time: 0 });
        crowd.add("walk", { time: 0, flip_x: true });
        crowd.add("idle", { time: 0, scale: 2 });
        const positions = new Float64Array([10, 100, 20, 50, 30, 10]);
        const batch = new SpriteBatch();
        const added: unknown[][] = [];
        const spy = batch as unknown as {
            add_frame: (...args: unknown[]) => void;
        };
        // The crowd hands the same options object on each time: copied here.
        spy.add_frame = (...args: unknown[]) => {
            added.push([...args.slice(0, 4), { ...(args[4] as object) }]);
        };
        expect(
            crowd.draw(batch, positions, {
                order: [2, 1, 0],
                scale: 0.5,
            }),
        ).toBe(3);
        expect(added.map((args) => [args[2], args[3]])).toEqual([
            [30, 10],
            [20, 50],
            [10, 100],
        ]);
        expect(added[0][1]).toBe(shared.frames[0]);
        expect(added[1][1]).toBe(shared.frames[4]);
        expect(added[0][4]).toMatchObject({ scale: 1, flip_x: false });
        expect(added[1][4]).toMatchObject({
            scale: 0.5,
            flip_x: true,
            anchor: { x: 16, y: 30 },
        });
        // without a picture there is nothing to draw
        shared.image = null;
        expect(crowd.draw(batch, positions)).toBe(0);
    });

    it("updates 10 000 walking members well inside a frame", () => {
        const crowd = new CrowdAnimation(sheet(), 10000, { events: false });
        for (let index = 0; index < 10000; index++) {
            crowd.add("walk", { speed: 0.8 + (index % 5) * 0.1 });
        }
        crowd.update(1 / 60);
        let best = Infinity;
        for (let round = 0; round < 20; round++) {
            const start = performance.now();
            crowd.update(1 / 60);
            best = Math.min(best, performance.now() - start);
        }
        expect(best).toBeLessThan(4);
    });
});
