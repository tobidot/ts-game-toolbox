import { describe, expect, it } from "vitest";
import { SeparatedBody, separate_bodies, steer_towards } from "./Steering";

const STEP = 1 / 30;

describe("steer_towards", () => {
    it("moves at the speed, straight at the target", () => {
        const body = { x: 0, y: 0 };
        const is_there = steer_towards(body, { x: 300, y: 400 }, 1, {
            speed: 50,
        });
        expect(is_there).toBe(false);
        expect(body.x).toBeCloseTo(30);
        expect(body.y).toBeCloseTo(40);
    });

    it("never overshoots, however long the step", () => {
        const body = { x: 0, y: 0 };
        expect(steer_towards(body, { x: 10, y: 0 }, 5, { speed: 100 })).toBe(
            true,
        );
        expect(body).toEqual({ x: 10, y: 0 });
    });

    it("doesn't shake at the target: the naive step does", () => {
        const naive = { x: 0, y: 0 };
        const steered = { x: 0, y: 0 };
        const target = { x: 100, y: 0 };
        const speed = 90;
        let naive_turns = 0;
        for (let step = 0; step < 120; step++) {
            const direction = Math.sign(target.x - naive.x);
            naive.x += direction * speed * STEP;
            if (Math.sign(target.x - naive.x) !== direction) {
                naive_turns += 1;
            }
            steer_towards(steered, target, STEP, { speed });
        }
        expect(naive_turns).toBeGreaterThan(50);
        expect(steered.x).toBe(100);
    });

    it("stops the stop distance short, and stays", () => {
        const body = { x: 0, y: 0 };
        const options = { speed: 1000, stop_distance: 30 };
        expect(steer_towards(body, { x: 100, y: 0 }, 1, options)).toBe(true);
        expect(body.x).toBeCloseTo(70);
        expect(steer_towards(body, { x: 100, y: 0 }, 1, options)).toBe(true);
        expect(body.x).toBeCloseTo(70);
    });

    it("slows down on the last stretch", () => {
        const body = { x: 0, y: 0 };
        const options = { speed: 100, slow_distance: 50 };
        steer_towards(body, { x: 25, y: 0 }, 0.1, options);
        expect(body.x).toBeCloseTo(5);
    });

    it("is there already on the spot, with no NaN", () => {
        const body = { x: 5, y: 5 };
        expect(steer_towards(body, { x: 5, y: 5 }, STEP, { speed: 10 })).toBe(
            true,
        );
        expect(body).toEqual({ x: 5, y: 5 });
    });
});

describe("separate_bodies", () => {
    const body = (x: number, y: number, radius = 10): SeparatedBody => ({
        x,
        y,
        radius,
    });

    it("leaves bodies alone that don't touch", () => {
        const bodies = [body(0, 0), body(20, 0)];
        separate_bodies(bodies, STEP);
        expect(bodies[0].x).toBe(0);
        expect(bodies[1].x).toBe(20);
    });

    it("pushes both apart evenly and softly, until they just touch", () => {
        const bodies = [body(0, 0), body(10, 0)];
        separate_bodies(bodies, STEP, 6);
        expect(bodies[0].x).toBeCloseTo(-1);
        expect(bodies[1].x).toBeCloseTo(11);
        for (let step = 0; step < 200; step++) {
            separate_bodies(bodies, STEP, 6);
        }
        expect(bodies[1].x - bodies[0].x).toBeCloseTo(20, 3);
    });

    it("never moves a fixed body, and the other takes the whole push", () => {
        const castle = { ...body(0, 0, 50), is_fixed: true };
        const slime = body(40, 0);
        separate_bodies([castle, slime], STEP, 6);
        expect(castle.x).toBe(0);
        expect(slime.x).toBeCloseTo(44);
    });

    it("parts bodies on one spot without NaN, the same way every time", () => {
        const stack = () => [body(5, 5), body(5, 5), body(5, 5), body(5, 5)];
        const first = stack();
        const second = stack();
        for (let step = 0; step < 300; step++) {
            separate_bodies(first, STEP);
            separate_bodies(second, STEP);
        }
        expect(first).toEqual(second);
        for (let a = 0; a < first.length; a++) {
            for (let b = a + 1; b < first.length; b++) {
                const apart = Math.hypot(
                    first[a].x - first[b].x,
                    first[a].y - first[b].y,
                );
                expect(apart).toBeGreaterThan(19.9);
            }
        }
    });

    it("gives the same result for the same bodies in another order", () => {
        const places = [
            [0, 0],
            [12, 3],
            [5, 14],
            [-9, 6],
        ];
        const forwards = places.map(([x, y]) => body(x, y));
        const backwards = places.map(([x, y]) => body(x, y)).reverse();
        separate_bodies(forwards, STEP);
        separate_bodies(backwards, STEP);
        forwards.forEach((one, index) => {
            const other = backwards[places.length - 1 - index];
            expect(one.x).toBeCloseTo(other.x, 9);
            expect(one.y).toBeCloseTo(other.y, 9);
        });
    });

    it("lets a crowd walk to one point and stand still there", () => {
        const target = { x: 0, y: 0 };
        const crowd: SeparatedBody[] = [];
        for (let index = 0; index < 40; index++) {
            const angle = index * 2.4;
            crowd.push(
                body(
                    Math.cos(angle) * (200 + index * 5),
                    Math.sin(angle) * (200 + index * 5),
                    8,
                ),
            );
        }
        const options = { speed: 40, slow_distance: 30 };
        const step_all = () => {
            for (const one of crowd) {
                steer_towards(one, target, STEP, options);
            }
            separate_bodies(crowd, STEP);
        };
        for (let step = 0; step < 900; step++) {
            step_all();
        }
        const before = crowd.map((one) => ({ x: one.x, y: one.y }));
        step_all();
        const moved = crowd.map((one, index) =>
            Math.hypot(one.x - before[index].x, one.y - before[index].y),
        );
        expect(Math.max(...moved)).toBeLessThan(0.05);
        // and it is a crowd, not a heap: the pressure squeezes it a little (they touch at 16)
        let closest = Infinity;
        for (let a = 0; a < crowd.length; a++) {
            for (let b = a + 1; b < crowd.length; b++) {
                closest = Math.min(
                    closest,
                    Math.hypot(
                        crowd[a].x - crowd[b].x,
                        crowd[a].y - crowd[b].y,
                    ),
                );
            }
        }
        expect(closest).toBeGreaterThan(6);
    });
});
