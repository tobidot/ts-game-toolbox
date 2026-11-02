import { describe, expect, it } from "vitest";
import { Vector2 } from "../../geometries/Vector2";
import {
    apex,
    flight_time,
    integrate,
    launch_velocity,
    projectile_position,
    range,
} from "./Kinematics";

const GRAVITY = 9.81;
const ORIGIN = { x: 0, y: 0 };

describe("launch_velocity", () => {
    it("points right at 0 and up (negative y) at a positive angle", () => {
        expect(launch_velocity(10, 0).x).toBeCloseTo(10);
        expect(launch_velocity(10, 0).y).toBeCloseTo(0);
        const up = launch_velocity(10, Math.PI / 2);
        expect(up.x).toBeCloseTo(0);
        expect(up.y).toBeCloseTo(-10);
        const diagonal = launch_velocity(10, Math.PI / 4);
        expect(diagonal.x).toBeCloseTo(Math.SQRT1_2 * 10);
        expect(diagonal.y).toBeCloseTo(-Math.SQRT1_2 * 10);
        expect(diagonal.len()).toBeCloseTo(10);
    });
});

describe("projectile_position", () => {
    it("follows p = o + v·t + ½·g·t²", () => {
        const velocity = { x: 3, y: -4 };
        const at = projectile_position({ x: 1, y: 2 }, velocity, 10, 2);
        expect(at.x).toBeCloseTo(1 + 3 * 2);
        expect(at.y).toBeCloseTo(2 - 4 * 2 + 0.5 * 10 * 4);
        expect(at).toBeInstanceOf(Vector2);
    });

    it("stays at the origin at t = 0", () => {
        const at = projectile_position({ x: 5, y: 6 }, { x: 9, y: 9 }, 10, 0);
        expect(at.x).toBe(5);
        expect(at.y).toBe(6);
    });
});

describe("flight_time", () => {
    it("is 2·vy/g from the ground", () => {
        const velocity = { x: 1, y: -9.81 };
        expect(flight_time(ORIGIN, velocity, GRAVITY, 0)).toBeCloseTo(2);
        expect(flight_time(ORIGIN, { x: 1, y: -20 }, 10, 0)).toBeCloseTo(4);
    });

    it("lands back on the ground at that time", () => {
        const velocity = launch_velocity(12, 0.6);
        const t = flight_time({ x: 2, y: -3 }, velocity, GRAVITY, 5);
        const landing = projectile_position(
            { x: 2, y: -3 },
            velocity,
            GRAVITY,
            t,
        );
        expect(landing.y).toBeCloseTo(5);
    });

    it("takes the fall from a height into account", () => {
        // dropped from 20 above the ground under g = 10: t = sqrt(2·20/10) = 2
        expect(
            flight_time({ x: 0, y: -20 }, { x: 1, y: 0 }, 10, 0),
        ).toBeCloseTo(2);
    });

    it("is 0 when the projectile never reaches the ground", () => {
        // below the ground, moving away (up) without gravity
        expect(flight_time({ x: 0, y: 10 }, { x: 1, y: -1 }, 0, 0)).toBe(0);
        // no gravity, no vertical motion
        expect(flight_time(ORIGIN, { x: 1, y: 0 }, 0, 5)).toBe(0);
        // no gravity, straight down from above: plain height / vy
        expect(flight_time(ORIGIN, { x: 0, y: 2 }, 0, 6)).toBeCloseTo(3);
    });
});

describe("range", () => {
    it("is longest at 45 degrees for equal speed", () => {
        const at = (degrees: number): number =>
            range(
                ORIGIN,
                launch_velocity(20, (degrees * Math.PI) / 180),
                GRAVITY,
                0,
            );
        expect(at(45)).toBeGreaterThan(at(30));
        expect(at(45)).toBeGreaterThan(at(60));
        expect(at(30)).toBeCloseTo(at(60));
        // v²·sin(2α)/g
        expect(at(45)).toBeCloseTo((20 * 20) / GRAVITY);
    });

    it("is signed by the horizontal velocity", () => {
        expect(range(ORIGIN, { x: -5, y: -10 }, 10, 0)).toBeCloseTo(-10);
    });
});

describe("apex", () => {
    it("is the point where the vertical velocity is 0", () => {
        // vy = -10, g = 10: t = 1, height = 10 - 5 = 5 above the origin
        const top = apex({ x: 0, y: 100 }, { x: 4, y: -10 }, 10);
        expect(top.x).toBeCloseTo(4);
        expect(top.y).toBeCloseTo(95);
    });

    it("is the origin when the projectile never rises", () => {
        expect(apex({ x: 1, y: 2 }, { x: 4, y: 3 }, 10)).toEqual(
            new Vector2(1, 2),
        );
        expect(apex({ x: 1, y: 2 }, { x: 4, y: -3 }, 0)).toEqual(
            new Vector2(1, 2),
        );
    });
});

describe("integrate", () => {
    it("moves velocity first, then position, and returns the same state", () => {
        const state = {
            position: new Vector2(0, 0),
            velocity: new Vector2(2, 0),
        };
        const result = integrate(state, { x: 0, y: 10 }, 0.5);
        expect(result).toBe(state);
        expect(state.velocity.x).toBeCloseTo(2);
        expect(state.velocity.y).toBeCloseTo(5);
        expect(state.position.x).toBeCloseTo(1);
        // the position used the new velocity (semi-implicit), not the old one
        expect(state.position.y).toBeCloseTo(2.5);
    });

    it("converges to projectile_position with small steps", () => {
        const velocity = launch_velocity(15, 0.9);
        const gravity = { x: 0, y: GRAVITY };
        const total = 1.5;
        const error_for = (step: number): number => {
            const state = {
                position: new Vector2(ORIGIN),
                velocity: velocity.cpy(),
            };
            const steps = Math.round(total / step);
            for (let index = 0; index < steps; index++) {
                integrate(state, gravity, total / steps);
            }
            const exact = projectile_position(ORIGIN, velocity, GRAVITY, total);
            return state.position.cpy().sub(exact).len();
        };
        const coarse = error_for(1 / 10);
        const fine = error_for(1 / 1000);
        expect(fine).toBeLessThan(coarse);
        expect(fine).toBeLessThan(0.02);
        // the x axis has no acceleration: exact at every step size
        const state = { position: new Vector2(), velocity: new Vector2(3, 0) };
        for (let index = 0; index < 7; index++) integrate(state, gravity, 0.2);
        expect(state.position.x).toBeCloseTo(3 * 1.4);
    });
});
