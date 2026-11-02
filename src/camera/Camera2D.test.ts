import { describe, expect, it } from "vitest";
import { Camera2D } from "./Camera2D";

const VIEWPORT = { width: 960, height: 640 };
const WORLD = { left: 0, top: 0, width: 10000, height: 640 };

describe("Camera2D", () => {
    it("starts at the origin and shows the viewport divided by the zoom", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        expect(camera.position.x).toBe(0);
        expect(camera.position.y).toBe(0);
        expect(camera.view).toEqual({
            left: 0,
            top: 0,
            width: 960,
            height: 640,
        });
        camera.zoom = 2;
        expect(camera.view).toEqual({
            left: 0,
            top: 0,
            width: 480,
            height: 320,
        });
    });

    it("centers on a point without a dead zone", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        camera.follow({ x: 1000, y: 500 });
        expect(camera.position.x).toBe(1000 - 480);
        expect(camera.position.y).toBe(500 - 320);
        camera.center_on({ x: 2000, y: 320 });
        expect(camera.center.x).toBe(2000);
        expect(camera.center.y).toBe(320);
    });

    it("keeps still while the target moves inside the dead zone", () => {
        const camera = new Camera2D({
            viewport: VIEWPORT,
            dead_zone: { left: -100, top: -80, width: 200, height: 160 },
        });
        camera.center_on({ x: 1000, y: 320 });
        camera.follow({ x: 1050, y: 300 });
        expect(camera.center.x).toBe(1000);
        expect(camera.center.y).toBe(320);
        // leaving the zone to the right drags the camera just far enough
        camera.follow({ x: 1130, y: 320 });
        expect(camera.center.x).toBe(1030);
        expect(camera.center.y).toBe(320);
        // and to the top
        camera.follow({ x: 1130, y: 200 });
        expect(camera.center.y).toBe(280);
    });

    it("never shows anything outside the bounds", () => {
        const camera = new Camera2D({ viewport: VIEWPORT, bounds: WORLD });
        camera.follow({ x: 10, y: 10 });
        expect(camera.position.x).toBe(0);
        expect(camera.position.y).toBe(0);
        camera.follow({ x: 99999, y: 99999 });
        expect(camera.position.x).toBe(WORLD.width - 960);
        expect(camera.position.y).toBe(0);
        camera.position.set(-50, -50);
        camera.clamp();
        expect(camera.position.x).toBe(0);
        expect(camera.position.y).toBe(0);
    });

    it("centers a world that is smaller than the view", () => {
        const camera = new Camera2D({
            viewport: VIEWPORT,
            bounds: { left: 0, top: 0, width: 400, height: 200 },
        });
        camera.follow({ x: 100, y: 100 });
        expect(camera.position.x).toBe((400 - 960) / 2);
        expect(camera.position.y).toBe((200 - 640) / 2);
    });

    it("looks ahead in the direction of the velocity", () => {
        const camera = new Camera2D({
            viewport: VIEWPORT,
            look_ahead: { x: 120, y: 0 },
        });
        camera.follow({ x: 1000, y: 320 }, { x: 5, y: 0 });
        expect(camera.center.x).toBe(1120);
        camera.follow({ x: 1000, y: 320 }, { x: -5, y: 0 });
        expect(camera.center.x).toBe(880);
        // a target that stops keeps the look-ahead it had
        camera.follow({ x: 1000, y: 320 }, { x: 0, y: 0 });
        expect(camera.center.x).toBe(880);
    });

    it("eases towards the target with smoothing and arrives eventually", () => {
        const camera = new Camera2D({ viewport: VIEWPORT, smoothing: 0.9 });
        camera.center_on({ x: 0, y: 0 });
        camera.follow({ x: 1000, y: 0 }, { x: 0, y: 0 }, 1 / 60);
        expect(camera.center.x).toBeCloseTo(100);
        for (let frame = 0; frame < 600; frame++) {
            camera.follow({ x: 1000, y: 0 }, { x: 0, y: 0 }, 1 / 60);
        }
        expect(camera.center.x).toBeCloseTo(1000, 3);
        // the same time in bigger steps covers the same distance
        const other = new Camera2D({ viewport: VIEWPORT, smoothing: 0.9 });
        other.center_on({ x: 0, y: 0 });
        other.follow({ x: 1000, y: 0 }, { x: 0, y: 0 }, 2 / 60);
        const twice = new Camera2D({ viewport: VIEWPORT, smoothing: 0.9 });
        twice.center_on({ x: 0, y: 0 });
        twice.follow({ x: 1000, y: 0 }, { x: 0, y: 0 }, 1 / 60);
        twice.follow({ x: 1000, y: 0 }, { x: 0, y: 0 }, 1 / 60);
        expect(other.center.x).toBeCloseTo(twice.center.x);
    });

    it("round-trips world <-> screen with zoom", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        camera.position.set(300, 40);
        camera.zoom = 2;
        const screen = camera.world_to_screen({ x: 350, y: 60 });
        expect(screen.x).toBe(100);
        expect(screen.y).toBe(40);
        const world = camera.screen_to_world(screen);
        expect(world.x).toBe(350);
        expect(world.y).toBe(60);
        expect(camera.screen_to_world({ x: 0, y: 0 })).toEqual(
            expect.objectContaining({ x: 300, y: 40 }),
        );
    });

    it("knows what is visible, with a margin", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        camera.position.set(1000, 0);
        expect(
            camera.is_visible({ left: 1500, top: 100, width: 50, height: 50 }),
        ).toBe(true);
        expect(
            camera.is_visible({ left: 900, top: 100, width: 50, height: 50 }),
        ).toBe(false);
        expect(
            camera.is_visible(
                { left: 900, top: 100, width: 50, height: 50 },
                60,
            ),
        ).toBe(true);
        expect(
            camera.is_visible({ left: 1960, top: 100, width: 50, height: 50 }),
        ).toBe(false);
    });

    it("scales the camera position for a parallax layer", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        camera.position.set(1000, 200);
        expect(camera.parallax(0)).toEqual(
            expect.objectContaining({ x: 0, y: 0 }),
        );
        expect(camera.parallax(0.3)).toEqual(
            expect.objectContaining({ x: 300, y: 60 }),
        );
        expect(camera.parallax(1)).toEqual(
            expect.objectContaining({ x: 1000, y: 200 }),
        );
    });

    it("applies translate and scale to a context", () => {
        const camera = new Camera2D({ viewport: VIEWPORT });
        camera.position.set(100, 50);
        camera.zoom = 2;
        const calls: number[][] = [];
        const context = {
            transform: (...args: number[]) => calls.push(args),
        } as unknown as CanvasRenderingContext2D;
        camera.apply(context);
        expect(calls).toEqual([[2, 0, 0, 2, -200, -100]]);
    });
});
