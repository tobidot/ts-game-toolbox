import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "../ui/widgets/Button";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";
import { IntroGate } from "../stage/IntroGate";

class Properties extends CanvasGameProperties<object> {
    public readonly button: Button;
    public constructor(settings: CanvasGameSettings, intro: IntroGate) {
        super(settings, intro);
        this.button = this.place(new Button("b", UNPLACED), () => UNPLACED);
    }
}

class Renderer extends CanvasGameRenderer<object> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<object, CanvasGameSettings, Properties> {
    public refusals = 0;
    public clicks = 0;
    protected create_game(): object {
        return {};
    }
    protected override on_start(): void {
        const button = this.properties.button;
        this.on_click(button, () => {
            this.clicks += 1;
        });
        this.on_refused(button, () => {
            this.refusals += 1;
        });
    }
}

class RefusingElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-refusing", RefusingElement);

describe("on_refused", () => {
    beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("runs the handler once per refusal, also after a reconnect", () => {
        const $element = document.createElement(
            "test-refusing",
        ) as RefusingElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        $element.remove();
        document.body.append($element);
        const logic = $element.logic;
        const button = logic.properties.button;
        button.click();
        expect(logic.clicks).toBe(1);
        expect(logic.refusals).toBe(0);
        button.is_disabled = true;
        button.click();
        expect(logic.clicks).toBe(1);
        expect(logic.refusals).toBe(1);
    });
});
