import { TestClass } from "../../src/testing/TestClass";
import { GameUiButton } from "../../src/game-ui/GameUiButton";
import { Rect } from "../../src/geometries/Rect";
import p5 from "p5";

class CustomTemplateButton extends GameUiButton {
    constructor(rect: Rect, text: string) {
        super(rect, text);
        this.set_background_color("#000000");
    }
}

export class GameUiTest extends TestClass {
    public get_name(): string {
        return "Game Ui Test"
    }
    private p: p5 | null = null;

    public set_up() {
        this.p = new p5(this.set_up_p5_instance_func);
    }

    public tear_down() {
        this.p?.remove();
    }

    public simulate_click_on_canvas(x: number, y: number) {
        const canvas = (<any>this.p).canvas as HTMLCanvasElement;
        const bounds = canvas.getBoundingClientRect();
        var evt = new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: bounds.top + x,
            clientY: bounds.left + y,
        });
        canvas.dispatchEvent(evt);
    }

    public set_up_p5_instance_func(p: p5) {
        p.setup = () => {
            p.createCanvas(100, 100);
        }
    }

    public test_simple_click_inside_should_hit() {
        let hit = false;
        debugger;
        const button = new GameUiButton(new Rect(25, 25, 50, 50))
            .set_text('click me')
            .set_on_click(() => { hit = true });
        button.handle_click(new p5.Vector().set(50, 50));

        this.simulate_click_on_canvas(50, 50);
        this.assert_true(hit);
    }

}