import { TestClass } from "../../src/testing/TestClass";
import { GameUiButton } from "../../src/game-ui/GameUiButton";
import { Rect } from "../../src/geometries/Rect";

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

}