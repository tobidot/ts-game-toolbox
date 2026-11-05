import { describe, expect, it } from "vitest";
import { Element } from "../Element";
import { ThemeTransformValue } from "../theme/Theme";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { Group } from "../Group";
import { Panel } from "./Panel";

/** Paints where the context stands, so a test can read the transform a child is drawn under. */
class Probe extends Element {
    public at: { x: number; y: number } | null = null;

    public override draw(ctx: CanvasRenderingContext2D): void {
        const matrix = (
            ctx as unknown as { position(): { x: number; y: number } }
        ).position();
        this.at = { x: matrix.x + this.rect.left, y: matrix.y + this.rect.top };
    }
}

/** Just enough of a context: it adds up translations. */
function translating_context(): CanvasRenderingContext2D {
    let x = 0;
    let y = 0;
    const saved: Array<{ x: number; y: number }> = [];
    return new Proxy(
        {},
        {
            get: (_target, name) => {
                if (name === "position") {
                    return () => ({ x, y });
                }
                if (name === "translate") {
                    return (dx: number, dy: number) => {
                        x += dx;
                        y += dy;
                    };
                }
                if (name === "save") {
                    return () => saved.push({ x, y });
                }
                if (name === "restore") {
                    return () => {
                        ({ x, y } = saved.pop() as { x: number; y: number });
                    };
                }
                return () => undefined;
            },
            set: () => true,
        },
    ) as unknown as CanvasRenderingContext2D;
}

const SLID = new ThemeTransformValue([{ type: "translate", x: 7, y: -3 }]);
const CHILD = { left: 5, top: 6, width: 10, height: 10 };
const RECT = { left: 100, top: 50, width: 40, height: 20 };

describe("a transform on a group", () => {
    it("moves what is in a Panel along with its background", () => {
        const probe = new Probe(CHILD);
        const panel = new Panel(
            [probe],
            RECT,
            true,
            theme_rules_from([["panel", { transform: SLID }]]),
        );
        panel.draw(translating_context());
        expect(probe.at).toEqual({ x: 112, y: 53 });
    });

    it("moves what is in a Group", () => {
        const probe = new Probe(CHILD);
        const group = new Group(
            [probe],
            RECT,
            true,
            theme_rules_from({ transform: SLID }),
        );
        group.draw(translating_context());
        expect(probe.at).toEqual({ x: 112, y: 53 });
    });

    it("leaves them where they are without one", () => {
        const probe = new Probe(CHILD);
        new Panel([probe], RECT).draw(translating_context());
        expect(probe.at).toEqual({ x: 105, y: 56 });
    });
});
