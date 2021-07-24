import * as tools from "../../../index";
import { RgbColor } from "../../../data/RgbColor";
import { Rect } from "../../../geometries/Rect";
import { CollectionTree } from "../../../trees/Collection";
import { UserInterfaceAdaptable } from "./adapters/UserInterfaceModelAdapter";
import { Model } from "./Model";

export class MenuButtonModel<UI_ACTION>
    extends Model<{ menu_buttons: CollectionTree<MenuButtonModel<UI_ACTION>> }>
    implements UserInterfaceAdaptable<UI_ACTION>
{
    // graphics
    public background: RgbColor = tools.Colors.BLUE;
    public foreground: RgbColor = tools.Colors.WHITE;
    public is_visible: boolean = true;
    public title: string = "Menu";
    // logic
    public static next_id: number = 1;
    public id: number = MenuButtonModel.next_id++;
    public parent_group_id: number | null = null;
    public collider: Rect = new Rect(0, 0, 0, 0);
    public action_id: UI_ACTION | null = null;

    public get is_clickable(): boolean {
        return this.is_visible;
    }

    public click(): UI_ACTION | null {
        return this.action_id;
    }
}
