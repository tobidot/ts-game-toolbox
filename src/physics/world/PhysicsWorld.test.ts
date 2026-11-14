import { describe, expect, it, vi } from "vitest";
import { PolygonI } from "../../geometries/Polygon";
import { SeededRandom } from "../../random/SeededRandom";
import { sat_axes, sat_overlap } from "../sweeping_sat/Sat";
import { AABB, AABB_SWEEP, CollisionRule, SAT_SWEEP } from "./CollisionRule";
import { ContactEvent } from "./ContactEvent";
import { ALL_LAYERS, PhysicsBody } from "./PhysicsBody";
import { PhysicsWorld, PhysicsWorldOptions } from "./PhysicsWorld";

/** A box around its own middle. */
const crate = (width: number, height: number = width): PolygonI => ({
    points: [
        { x: -width / 2, y: -height / 2 },
        { x: width / 2, y: -height / 2 },
        { x: width / 2, y: height / 2 },
        { x: -width / 2, y: height / 2 },
    ],
});

const triangle = (radius: number): PolygonI => ({
    points: [0, 1, 2].map((index) => ({
        x: radius * Math.cos(-Math.PI / 2 + (index * Math.PI * 2) / 3),
        y: radius * Math.sin(-Math.PI / 2 + (index * Math.PI * 2) / 3),
    })),
});

/** A box with walls and a floor: 800 wide, the floor's top at 600. */
function boxed_world<D = unknown>(
    options: PhysicsWorldOptions = {},
): PhysicsWorld<D> {
    const world = new PhysicsWorld<D>({
        gravity: { x: 0, y: 900 },
        restitution: 0.2,
        friction: 0.1,
        ...options,
    });
    world.add({
        shape: crate(1000, 40),
        position: { x: 400, y: 620 },
        is_static: true,
    });
    world.add({
        shape: crate(40, 1000),
        position: { x: -20, y: 100 },
        is_static: true,
    });
    world.add({
        shape: crate(40, 1000),
        position: { x: 820, y: 100 },
        is_static: true,
    });
    return world;
}

function run<D>(world: PhysicsWorld<D>, seconds: number): void {
    const steps = Math.round(seconds / world.step_seconds);
    for (let step = 0; step < steps; step++) {
        world.step();
    }
}

/** The deepest overlap between any two moving bodies. */
function deepest_overlap<D>(world: PhysicsWorld<D>): number {
    const moving = world.bodies.filter((body) => !body.is_static);
    let deepest = 0;
    for (let first = 0; first < moving.length; first++) {
        for (let second = first + 1; second < moving.length; second++) {
            const contact = sat_overlap(
                moving[first].polygon,
                moving[second].polygon,
            );
            if (contact !== null) {
                deepest = Math.max(deepest, contact.depth);
            }
        }
    }
    return deepest;
}

describe("PhysicsBody", () => {
    it("knows its shape and box where it is now", () => {
        const world = new PhysicsWorld();
        const body = world.add({
            shape: crate(10, 20),
            position: { x: 100, y: 50 },
        });
        expect(body.box).toEqual({ left: 95, top: 40, width: 10, height: 20 });
        expect(body.polygon.points[0]).toEqual({ x: 95, y: 40 });
        body.position.x = 200;
        expect(body.box.left).toBe(195);
        expect(body.polygon.points[2]).toEqual({ x: 205, y: 60 });
    });

    it("works out the axes of its shape once: it never turns, so they hold wherever it goes", () => {
        const world = new PhysicsWorld();
        const body = world.add({
            shape: triangle(10),
            position: { x: 100, y: 50 },
        });
        const axes = body.axes;
        expect(axes).toEqual(sat_axes(triangle(10)));
        body.position.x = 300;
        expect(body.polygon.points[0].x).toBeCloseTo(300);
        expect(body.axes).toBe(axes);
    });

    it("is still with an endless mass, or moving with mass 1 unless told", () => {
        const world = new PhysicsWorld();
        const wall = world.add({
            shape: crate(10),
            position: { x: 0, y: 0 },
            is_static: true,
        });
        const ball = world.add({ shape: crate(10), position: { x: 0, y: 50 } });
        expect(wall.mass).toBe(Infinity);
        expect(ball.mass).toBe(1);
        expect(ball.velocity).toEqual({ x: 0, y: 0 });
    });
});

describe("PhysicsWorld", () => {
    it("drops a body onto the floor, where it stays", () => {
        const world = boxed_world();
        const body = world.add({
            shape: crate(36),
            position: { x: 400, y: 100 },
        });
        run(world, 3);
        // the floor's top is at 600, the crate is 36 high
        expect(body.position.y).toBeCloseTo(582, 1);
        expect(body.position.x).toBeCloseTo(400);
        expect(Math.abs(body.velocity.y)).toBeLessThan(20);
    });

    it("lands a body on a slope under SAT_SWEEP, and on the slope's box under AABB_SWEEP", () => {
        const slope: PolygonI = {
            points: [
                { x: 0, y: 200 },
                { x: 400, y: 0 },
                { x: 400, y: 200 },
            ],
        };
        const heights: number[] = [];
        for (const rule of [SAT_SWEEP, AABB_SWEEP]) {
            const world = new PhysicsWorld({
                rule,
                gravity: { x: 0, y: 900 },
            });
            world.add({
                shape: slope,
                position: { x: 0, y: 400 },
                is_static: true,
            });
            const body = world.add({
                shape: crate(20),
                position: { x: 100, y: 0 },
            });
            run(world, 1.2);
            heights.push(body.position.y);
        }
        // the slope's box has its top at 400; the slope under x = 100 is at 550
        expect(heights[1]).toBeCloseTo(390, 0);
        expect(heights[0]).toBeGreaterThan(500);
    });

    it("lets nothing tunnel under the sweeping rules, at the express speed of step 26", () => {
        // 2,700 units/s at 60 steps a second: 45 a step against a board 10 thick
        for (const rule of [AABB_SWEEP, SAT_SWEEP, AABB]) {
            const world = new PhysicsWorld({ rule });
            world.add({
                shape: crate(10, 400),
                position: { x: 300, y: 0 },
                is_static: true,
            });
            const parcel = world.add({
                shape: crate(22),
                position: { x: 0, y: 0 },
                velocity: { x: 2700, y: 0 },
            });
            run(world, 1);
            if (rule === AABB) {
                expect(parcel.position.x).toBeGreaterThan(300);
            } else {
                expect(parcel.position.x).toBeLessThan(300 - 5 - 11 + 0.1);
            }
        }
    });

    it("pushes two moving bodies apart by mass and takes their closing speed", () => {
        const world = new PhysicsWorld({ restitution: 0 });
        const light = world.add({
            shape: crate(10),
            position: { x: 0, y: 0 },
            velocity: { x: 60, y: 0 },
        });
        const heavy = world.add({
            shape: crate(10),
            position: { x: 10.5, y: 0 },
            velocity: { x: 0, y: 0 },
            mass: 3,
        });
        world.step();
        // they met: momentum 60 shared by the mass 4
        expect(light.velocity.x).toBeCloseTo(15);
        expect(heavy.velocity.x).toBeCloseTo(15);
        expect(sat_overlap(light.polygon, heavy.polygon)).toBeNull();
        // the light one moved 1 and sank 0.5 deep; it gives way three times as far
        expect(light.position.x).toBeCloseTo(1 - 0.375);
        expect(heavy.position.x).toBeCloseTo(10.5 + 0.125);
    });

    it("brings a pile of 200 crates to rest without bodies sinking into each other", () => {
        const world = boxed_world();
        const random = new SeededRandom(7);
        for (let index = 0; index < 200; index++) {
            world.add({
                shape: crate(30),
                position: {
                    x: random.float(40, 760),
                    y: 560 - Math.floor(index / 20) * 34 - random.float(0, 4),
                },
            });
        }
        // the start rows already touch: settle, then look
        run(world, 6);
        expect(deepest_overlap(world)).toBeLessThan(1);
        const moving = world.bodies.filter((body) => !body.is_static);
        const fastest = Math.max(
            ...moving.map((body) =>
                Math.hypot(body.velocity.x, body.velocity.y),
            ),
        );
        expect(fastest).toBeLessThan(40);
        // nothing left the box, nothing fell through the floor
        for (const body of moving) {
            expect(body.position.y).toBeLessThan(600);
            expect(body.position.x).toBeGreaterThan(0);
            expect(body.position.x).toBeLessThan(800);
        }
        // and it stays: two more seconds move nothing by more than a little
        const before = moving.map((body) => ({ ...body.position }));
        run(world, 2);
        for (let index = 0; index < moving.length; index++) {
            expect(
                Math.hypot(
                    moving[index].position.x - before[index].x,
                    moving[index].position.y - before[index].y,
                ),
            ).toBeLessThan(3);
        }
        expect(deepest_overlap(world)).toBeLessThan(1);
    });

    it("sends contacts as events after the step, with the bodies, the normal and the speed", () => {
        const world = boxed_world<string>({ contact_event_speed: 100 });
        const body = world.add({
            shape: crate(36),
            position: { x: 400, y: 500 },
            velocity: { x: 0, y: 600 },
            data: "crate",
        });
        const floor = world.bodies[0];
        const events: ContactEvent<string>[] = [];
        world.events.attach(ContactEvent, (event) => {
            events.push(event as ContactEvent<string>);
            // after the step: the body already stands on the floor
            expect(body.position.y).toBeLessThan(582.1);
        });
        run(world, 0.5);
        expect(events.length).toBeGreaterThan(0);
        const first = events[0];
        expect(first.a).toBe(body);
        expect(first.b).toBe(floor);
        expect(first.a.data).toBe("crate");
        expect(first.normal.y).toBeCloseTo(-1);
        expect(first.speed).toBeGreaterThan(600);
        // resting contacts close slower than 100 and are not sent
        const count = events.length;
        run(world, 1);
        expect(events.length).toBe(count);
    });

    it("lets a contact listener remove a body without breaking the step", () => {
        const world = boxed_world();
        const random = new SeededRandom(3);
        for (let index = 0; index < 60; index++) {
            world.add({
                shape: index % 2 === 0 ? crate(24) : triangle(16),
                position: { x: random.float(60, 740), y: random.float(0, 500) },
                velocity: { x: random.float(-200, 200), y: 0 },
            });
        }
        let removed = 0;
        world.events.attach(ContactEvent, (event) => {
            if (!event.b.is_static && event.b.is_in_world) {
                expect(world.remove(event.b)).toBe(true);
                removed += 1;
            }
        });
        run(world, 4);
        expect(removed).toBeGreaterThan(0);
        expect(world.bodies.length).toBe(3 + 60 - removed);
        expect(world.bodies.every((body) => body.is_in_world)).toBe(true);
        // a body removed twice is only removed once
        const last = world.bodies[world.bodies.length - 1];
        expect(world.remove(last)).toBe(true);
        expect(world.remove(last)).toBe(false);
    });

    it("keeps the bodies in the order they were added, after removals too", () => {
        const world = new PhysicsWorld<number>();
        const bodies: PhysicsBody<number>[] = [];
        for (let index = 0; index < 6; index++) {
            bodies.push(
                world.add({
                    shape: crate(4),
                    position: { x: index * 10, y: 0 },
                    data: index,
                }),
            );
        }
        world.remove(bodies[1]);
        world.remove(bodies[4]);
        expect(world.bodies.map((body) => body.data)).toEqual([0, 2, 3, 5]);
    });

    it("runs the same steps whatever the frame rate", () => {
        const final_positions: { x: number; y: number }[] = [];
        for (const frames_per_second of [30, 60, 144, 47]) {
            const world = boxed_world();
            const body = world.add({
                shape: triangle(20),
                position: { x: 200, y: 100 },
                velocity: { x: 120, y: -100 },
            });
            let steps = 0;
            for (let frame = 0; frame < frames_per_second * 2; frame++) {
                world.update(1 / frames_per_second);
                steps += world.stats.steps;
            }
            expect(Math.abs(steps - 120)).toBeLessThanOrEqual(1);
            // a step left over by rounding is one more step, not a different one
            while (steps < 120) {
                world.step();
                steps += 1;
            }
            final_positions.push({ ...body.position });
        }
        for (const position of final_positions) {
            expect(position.x).toBeCloseTo(final_positions[0].x, 6);
            expect(position.y).toBeCloseTo(final_positions[0].y, 6);
        }
    });

    it("runs at most 4 steps an update and drops the rest: no spiral of death", () => {
        const slow = boxed_world();
        const stepped = boxed_world();
        const body = slow.add({ shape: crate(20), position: { x: 400, y: 0 } });
        const twin = stepped.add({
            shape: crate(20),
            position: { x: 400, y: 0 },
        });
        // half a second of frame: 30 steps due, 4 run
        slow.update(0.5);
        expect(slow.stats.steps).toBe(4);
        for (let step = 0; step < 4; step++) {
            stepped.step();
        }
        expect(body.position).toEqual(twin.position);
        // the rest is gone: the next frame runs one step, not 27
        slow.update(1 / 60);
        expect(slow.stats.steps).toBe(1);
        // a game may allow more, or fewer
        const patient = boxed_world({ max_steps_per_update: 10 });
        patient.update(0.5);
        expect(patient.stats.steps).toBe(10);
    });

    it("counts its bodies, the pairs it tested, the contacts and the time of a step", () => {
        const world = boxed_world();
        for (let index = 0; index < 10; index++) {
            world.add({
                shape: crate(20),
                position: { x: 100 + index * 15, y: 570 },
            });
        }
        world.step();
        const stats = world.stats;
        expect(stats.bodies).toBe(13);
        expect(stats.pairs_tested).toBeGreaterThan(0);
        expect(stats.contacts).toBeGreaterThan(0);
        expect(stats.step_ms).toBeGreaterThanOrEqual(0);
    });

    it("finds the same contacts with the grid as with no broad phase, on a seeded scene", () => {
        const runs: { events: string[]; positions: string }[] = [];
        for (const broad_phase of [
            { kind: "none" as const },
            { kind: "grid" as const, cell_size: 64 },
            { kind: "grid" as const, cell_size: 17 },
        ]) {
            const world = boxed_world<number>({ broad_phase });
            const random = new SeededRandom(11);
            for (let index = 0; index < 150; index++) {
                world.add({
                    shape: index % 3 === 0 ? triangle(14) : crate(18, 12),
                    position: {
                        x: random.float(40, 760),
                        y: random.float(0, 560),
                    },
                    velocity: {
                        x: random.float(-300, 300),
                        y: random.float(-300, 300),
                    },
                    data: index,
                });
            }
            const events: string[] = [];
            world.events.attach(ContactEvent, (event) => {
                const contact = event as ContactEvent<number>;
                events.push(
                    `${contact.a.data} ${contact.b.data ?? "wall"} ${contact.speed.toFixed(6)}`,
                );
            });
            run(world, 2);
            runs.push({
                events,
                positions: world.bodies
                    .map(
                        (body) =>
                            `${body.position.x.toFixed(6)},${body.position.y.toFixed(6)}`,
                    )
                    .join(" "),
            });
        }
        expect(runs[0].events.length).toBeGreaterThan(100);
        for (const other of runs.slice(1)) {
            expect(other.events).toEqual(runs[0].events);
            expect(other.positions).toEqual(runs[0].positions);
        }
    });

    it("switches the broad phase between steps", () => {
        const world = boxed_world();
        expect(world.broad_phase).toEqual({ kind: "grid", cell_size: 64 });
        world.add({ shape: crate(20), position: { x: 400, y: 100 } });
        run(world, 0.5);
        world.broad_phase = { kind: "none" };
        run(world, 0.5);
        world.broad_phase = { kind: "grid", cell_size: 32 };
        run(world, 1);
        expect(world.bodies[3].position.y).toBeCloseTo(590, 1);
    });

    it("skips the pairs layers and masks rule out: bullets don't hit bullets", () => {
        const WALLS = 1;
        const BULLETS = 2;
        const ZOMBIES = 4;
        for (const broad_phase of [
            { kind: "none" as const },
            { kind: "grid" as const, cell_size: 32 },
        ]) {
            const world = new PhysicsWorld<string>({ broad_phase });
            world.add({
                shape: crate(10, 200),
                position: { x: 300, y: 0 },
                is_static: true,
                layer: WALLS,
                data: "wall",
            });
            const bullets = [0, 1, 2].map((index) =>
                world.add({
                    shape: crate(4),
                    position: { x: index * 3, y: 0 },
                    velocity: { x: 600, y: 0 },
                    layer: BULLETS,
                    mask: WALLS | ZOMBIES,
                    data: "bullet",
                }),
            );
            const zombie = world.add({
                shape: crate(20),
                position: { x: 100, y: 40 },
                velocity: { x: 0, y: -60 },
                layer: ZOMBIES,
                data: "zombie",
            });
            expect(zombie.mask).toBe(ALL_LAYERS);
            const met: string[] = [];
            world.events.attach(ContactEvent, (event) => {
                const contact = event as ContactEvent<string>;
                met.push(`${contact.a.data}-${contact.b.data}`);
            });
            // the bullets overlap each other from the start and are never pushed apart
            world.step();
            expect(bullets[1].position.x - bullets[0].position.x).toBeCloseTo(
                3,
            );
            // without a broad phase the wall is handed to every move; never a bullet to a bullet
            expect(world.stats.pairs_tested).toBe(
                broad_phase.kind === "none" ? 4 : 0,
            );
            run(world, 1);
            expect(met).not.toContain("bullet-bullet");
            expect(met).toContain("bullet-wall");
            // a ghost passes through the wall: its mask leaves the walls out
            const ghost = world.add({
                shape: crate(10),
                position: { x: 200, y: 0 },
                velocity: { x: 600, y: 0 },
                layer: 8,
                mask: ALL_LAYERS & ~WALLS,
            });
            run(world, 0.5);
            expect(ghost.position.x).toBeGreaterThan(400);
        }
    });

    it("takes another rule between steps", () => {
        const world = boxed_world({ rule: AABB });
        expect(world.rule).toBe(AABB);
        const custom: CollisionRule = { ...SAT_SWEEP, name: "mine" };
        world.rule = custom;
        world.add({ shape: crate(20), position: { x: 400, y: 100 } });
        run(world, 1);
        expect(world.rule.name).toBe("mine");
    });
});

/** What a run of frames over a world with costly steps came to. */
interface FrameRun {
    frames_per_second: number;
    /** Seconds simulated per second of real time: 1 keeps up, 0.5 runs at half speed. */
    speed: number;
    /** How many steps each frame ran. */
    steps: number[];
}

/**
 * Ten seconds of a frame loop over a world whose every step costs `cost_ms` on a fake clock.
 * A frame lasts as long as its steps and 2 ms of painting, never less than a 60 Hz frame. With
 * `jitter_ms`, the 60 Hz frames come up to that much early or late, as browsers hand them out.
 */
function frame_loop(
    options: PhysicsWorldOptions,
    cost_ms: (frame: number) => number,
    jitter_ms = 0,
): FrameRun {
    let clock_ms = 0;
    let frame = 0;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock_ms);
    class CostlyWorld extends PhysicsWorld {
        public override step(): void {
            super.step();
            clock_ms += cost_ms(frame);
        }
    }
    try {
        const world = new CostlyWorld(options);
        const random = new SeededRandom(3);
        const steps: number[] = [];
        let delta_ms = 1000 / 60;
        let late_ms = 0;
        while (clock_ms < 10000) {
            const started = clock_ms;
            world.update(delta_ms / 1000);
            steps.push(world.stats.steps);
            const work_ms = clock_ms - started + 2;
            const next_late_ms = random.float(-jitter_ms, jitter_ms);
            delta_ms = Math.max(1000 / 60 + next_late_ms - late_ms, work_ms);
            late_ms = next_late_ms;
            clock_ms = started + delta_ms;
            frame += 1;
        }
        const simulated = steps.reduce((sum, count) => sum + count, 0) / 60;
        return {
            frames_per_second: steps.length / (clock_ms / 1000),
            speed: simulated / (clock_ms / 1000),
            steps,
        };
    } finally {
        spy.mockRestore();
    }
}

describe("PhysicsWorld under load", () => {
    it("fell off a cliff when it caught up at any cost: a step a little too slow made every frame 4 steps", () => {
        const old = { catch_up_ms: Infinity };
        expect(frame_loop(old, () => 13).frames_per_second).toBeGreaterThan(58);
        expect(frame_loop(old, () => 17).frames_per_second).toBeLessThan(20);
    });

    it("slides gently instead: no further step in an update once the steps took catch_up_ms", () => {
        let previous = Infinity;
        for (let cost = 1; cost <= 40; cost++) {
            const run = frame_loop({}, () => cost);
            // one step and painting a frame, never more than one step's cost a frame beyond that
            const one_step = Math.min(60, 1000 / (cost + 2));
            expect(run.frames_per_second).toBeGreaterThan(one_step * 0.97);
            expect(run.frames_per_second).toBeLessThanOrEqual(previous + 0.5);
            if (previous !== Infinity) {
                expect(run.frames_per_second).toBeGreaterThan(previous * 0.9);
            }
            previous = run.frames_per_second;
        }
        // what it costs: the world runs slower than real time
        const slow = frame_loop({}, () => 20);
        expect(slow.frames_per_second).toBeCloseTo(1000 / 22, 0);
        expect(slow.speed).toBeCloseTo(1000 / 22 / 60, 1);
    });

    it("still catches up while steps are cheap, and never past max_steps_per_update", () => {
        // a 100 ms hitch every second, cheap steps: all the time is caught up
        const cheap = frame_loop({}, (frame) => (frame % 60 === 0 ? 98 : 1));
        expect(cheap.speed).toBeCloseTo(1, 1);
        expect(Math.max(...cheap.steps)).toBe(4);
        const patient = frame_loop({ max_steps_per_update: 2 }, (frame) =>
            frame % 60 === 0 ? 98 : 1,
        );
        expect(Math.max(...patient.steps)).toBe(2);
    });

    it("runs exactly one step a frame when one step is all it affords, however the frames jitter", () => {
        const run = frame_loop({}, () => 10, 1.5);
        // once the first frame that couldn't catch up has set the phase: never none and never two
        const first_short = run.steps.findIndex((count) => count === 0);
        expect(first_short).toBeLessThan(5);
        expect(new Set(run.steps.slice(first_short + 2))).toEqual(new Set([1]));
        expect(run.speed).toBeCloseTo(1, 2);
    });
});
