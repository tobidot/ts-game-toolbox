import { describe, expect, it } from "vitest";
import { IntroGate } from "../stage/IntroGate";
import { Button } from "../ui/widgets/Button";
import { Panel } from "../ui/widgets/Panel";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameSettings } from "./CanvasGameSettings";

const WIDE = { width: 960, height: 640 };
const TALL = { width: 600, height: 960 };

class Settings extends CanvasGameSettings {
    public override readonly layouts = [WIDE, TALL];
}

function properties(): CanvasGameProperties<object> {
    return new CanvasGameProperties<object>(new Settings(), {} as IntroGate);
}

describe("place", () => {
    it("adds to the page by default and follows the layout", () => {
        const game = properties();
        const button = game.place(new Button("b", UNPLACED), (layout) => ({
            left: 0,
            top: 0,
            width: layout.width,
            height: 10,
        }));
        expect(game.page.children).toContain(button);
        expect(button.rect.width).toBe(960);
        game.place_widgets(TALL);
        expect(button.rect.width).toBe(600);
    });

    it("adds to a parent when told, and only there", () => {
        const game = properties();
        const panel = game.place(new Panel([], UNPLACED), () => UNPLACED);
        const button = game.place(
            new Button("b", UNPLACED),
            (layout) => ({
                left: 5,
                top: 0,
                width: layout.width / 2,
                height: 10,
            }),
            panel,
        );
        expect(panel.children).toEqual([button]);
        expect(game.page.children).not.toContain(button);
        expect(button.parent).toBe(panel);
        expect(button.rect.width).toBe(480);
        game.place_widgets(TALL);
        expect(button.rect.width).toBe(300);
    });
});
