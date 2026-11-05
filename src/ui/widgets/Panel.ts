import { RectI } from "../../geometries";
import { ThemeRule } from "../theme/Theme";
import { Group } from "../Group";
import { Element } from "../Element";

export class Panel extends Group {
    public constructor(
        children: Array<Element>,
        rect: RectI,
        is_visible: boolean = true,
        theme_rules?: Array<ThemeRule>,
    ) {
        super(children, rect, is_visible, theme_rules);
        this.type = "panel";
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        if (!this.is_visible) {
            return;
        }

        ctx.save();

        this.context_transform_to_local(ctx);
        this.draw_background(ctx);

        ctx.restore(); // transform

        super.draw(ctx);
    }
}
