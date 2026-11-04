import { describe, expect, it } from "vitest";
import {
    circle_contact,
    circle_rect_contact,
    elastic_impact,
    reflect,
} from "./Bounce";

const box = { left: 0, top: 0, width: 100, height: 50 };

function expect_vector(
    actual: { x: number; y: number },
    x: number,
    y: number,
): void {
    expect(actual.x).toBeCloseTo(x, 9);
    expect(actual.y).toBeCloseTo(y, 9);
}

describe("reflect", () => {
    it("bounces off each of the four walls", () => {
        const velocity = { x: 3, y: 4 };
        // a wall on the right and one at the bottom face back at the ball
        expect_vector(reflect(velocity, { x: -1, y: 0 }), -3, 4);
        expect_vector(reflect(velocity, { x: 0, y: -1 }), 3, -4);
        const away = { x: -3, y: -4 };
        // a wall on the left and one at the top
        expect_vector(reflect(away, { x: 1, y: 0 }), 3, -4);
        expect_vector(reflect(away, { x: 0, y: 1 }), -3, 4);
    });

    it("loses speed along the normal only, by the restitution", () => {
        const velocity = reflect({ x: 3, y: 10 }, { x: 0, y: -1 }, 0.5);
        expect_vector(velocity, 3, -5);
        const dead = reflect({ x: 3, y: 10 }, { x: 0, y: -1 }, 0);
        expect_vector(dead, 3, 0);
    });

    it("bounces off a diagonal surface", () => {
        const normal = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
        expect_vector(reflect({ x: 0, y: 5 }, normal), 5, 0);
    });

    it("leaves a velocity alone that already moves away", () => {
        const velocity = { x: 3, y: -4 };
        const after = reflect(velocity, { x: 0, y: -1 }, 0.5);
        expect(after).toEqual(velocity);
        expect(after).not.toBe(velocity);
    });

    it("leaves a velocity along the surface alone", () => {
        expect(reflect({ x: 7, y: 0 }, { x: 0, y: -1 })).toEqual({
            x: 7,
            y: 0,
        });
    });
});

describe("circle_contact", () => {
    it("points from b to a and says how deep they overlap", () => {
        const contact = circle_contact(
            { x: 10, y: 0, radius: 6 },
            { x: 0, y: 0, radius: 6 },
        );
        expect(contact?.normal).toEqual({ x: 1, y: 0 });
        expect(contact?.depth).toBeCloseTo(2, 9);
    });

    it("is a unit normal on a slant", () => {
        const contact = circle_contact(
            { x: 3, y: 4, radius: 5 },
            { x: 0, y: 0, radius: 5 },
        );
        expect_vector(contact?.normal ?? { x: 0, y: 0 }, 0.6, 0.8);
        expect(contact?.depth).toBeCloseTo(5, 9);
    });

    it("is null when apart, and touching counts as apart", () => {
        const a = { x: 0, y: 0, radius: 5 };
        expect(circle_contact(a, { x: 20, y: 0, radius: 5 })).toBeNull();
        expect(circle_contact(a, { x: 10, y: 0, radius: 5 })).toBeNull();
    });

    it("still has a usable normal for two circles at one spot", () => {
        const contact = circle_contact(
            { x: 4, y: 4, radius: 3 },
            { x: 4, y: 4, radius: 2 },
        );
        expect(contact).toEqual({ normal: { x: 1, y: 0 }, depth: 5 });
    });
});

describe("circle_rect_contact", () => {
    it("pushes straight out of an edge", () => {
        const contact = circle_rect_contact({ x: 50, y: -3, radius: 5 }, box);
        expect(contact?.normal).toEqual({ x: 0, y: -1 });
        expect(contact?.depth).toBeCloseTo(2, 9);
    });

    it("gets a diagonal normal at a corner", () => {
        const contact = circle_rect_contact({ x: 103, y: 54, radius: 10 }, box);
        expect_vector(contact?.normal ?? { x: 0, y: 0 }, 0.6, 0.8);
        expect(contact?.depth).toBeCloseTo(5, 9);
    });

    it("is null when apart: beside a corner the box's bounds are not enough", () => {
        expect(
            circle_rect_contact({ x: 50, y: -10, radius: 5 }, box),
        ).toBeNull();
        // inside the bounding square of the circle, but past the corner's arc
        expect(
            circle_rect_contact({ x: 104, y: 54, radius: 5 }, box),
        ).toBeNull();
    });

    it("still gets a usable normal with the centre inside the box", () => {
        const left = circle_rect_contact({ x: 2, y: 25, radius: 5 }, box);
        expect(left?.normal).toEqual({ x: -1, y: 0 });
        expect(left?.depth).toBeCloseTo(7, 9);
        const bottom = circle_rect_contact({ x: 50, y: 49, radius: 5 }, box);
        expect(bottom?.normal).toEqual({ x: 0, y: 1 });
        expect(bottom?.depth).toBeCloseTo(6, 9);
    });

    it("gets a usable normal with the centre exactly on the edge", () => {
        const contact = circle_rect_contact({ x: 100, y: 25, radius: 5 }, box);
        expect(contact?.normal).toEqual({ x: 1, y: 0 });
        expect(contact?.depth).toBeCloseTo(5, 9);
    });
});

describe("elastic_impact", () => {
    const right = { x: 1, y: 0 };

    it("swaps the velocities of two equal masses head-on", () => {
        const after = elastic_impact(
            { velocity: { x: -5, y: 0 }, mass: 1 },
            { velocity: { x: 3, y: 0 }, mass: 1 },
            right,
        );
        expect_vector(after.a, 3, 0);
        expect_vector(after.b, -5, 0);
    });

    it("hands the whole speed to a resting ball of the same mass", () => {
        const after = elastic_impact(
            { velocity: { x: 0, y: 0 }, mass: 2 },
            { velocity: { x: 8, y: 0 }, mass: 2 },
            right,
        );
        expect_vector(after.a, 8, 0);
        expect_vector(after.b, 0, 0);
    });

    it("keeps the speed across the normal: a glancing hit", () => {
        const after = elastic_impact(
            { velocity: { x: 0, y: 0 }, mass: 1 },
            { velocity: { x: 4, y: 9 }, mass: 1 },
            right,
        );
        expect_vector(after.a, 4, 0);
        expect_vector(after.b, 0, 9);
    });

    it("barely bothers a heavy body with a light one", () => {
        const after = elastic_impact(
            { velocity: { x: 0, y: 0 }, mass: 1000 },
            { velocity: { x: 10, y: 0 }, mass: 1 },
            right,
        );
        expect(Math.abs(after.a.x)).toBeLessThan(0.03);
        expect(after.b.x).toBeCloseTo(-9.98, 1);
    });

    it("conserves momentum for any masses and restitution", () => {
        const a = { velocity: { x: -6, y: 2 }, mass: 3 };
        const b = { velocity: { x: 4, y: -1 }, mass: 7 };
        const normal = { x: 0.6, y: 0.8 };
        for (const restitution of [0, 0.5, 1]) {
            const after = elastic_impact(a, b, normal, restitution);
            expect(a.mass * after.a.x + b.mass * after.b.x).toBeCloseTo(
                a.mass * a.velocity.x + b.mass * b.velocity.x,
                9,
            );
            expect(a.mass * after.a.y + b.mass * after.b.y).toBeCloseTo(
                a.mass * a.velocity.y + b.mass * b.velocity.y,
                9,
            );
        }
    });

    it("loses the closing speed by the restitution", () => {
        const after = elastic_impact(
            { velocity: { x: -10, y: 0 }, mass: 1 },
            { velocity: { x: 0, y: 0 }, mass: 1 },
            right,
            0.5,
        );
        // they part at half the speed they met with
        expect(after.a.x - after.b.x).toBeCloseTo(5, 9);
    });

    it("leaves bodies alone that already move apart", () => {
        const a = { velocity: { x: 5, y: 1 }, mass: 1 };
        const b = { velocity: { x: -5, y: 1 }, mass: 1 };
        const after = elastic_impact(a, b, right);
        expect(after.a).toEqual(a.velocity);
        expect(after.b).toEqual(b.velocity);
    });

    it("treats infinite mass as a wall: the same as reflect", () => {
        const velocity = { x: -6, y: 2 };
        const after = elastic_impact(
            { velocity, mass: 1 },
            { velocity: { x: 0, y: 0 }, mass: Infinity },
            right,
            0.5,
        );
        expect_vector(after.a, reflect(velocity, right, 0.5).x, 2);
        expect_vector(after.b, 0, 0);
    });

    it("does not break on two immovable bodies", () => {
        const after = elastic_impact(
            { velocity: { x: -1, y: 0 }, mass: Infinity },
            { velocity: { x: 1, y: 0 }, mass: Infinity },
            right,
        );
        expect(after.a).toEqual({ x: -1, y: 0 });
        expect(after.b).toEqual({ x: 1, y: 0 });
    });
});
