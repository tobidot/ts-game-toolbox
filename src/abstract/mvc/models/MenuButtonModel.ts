import { tools } from "../../../../index";
import { RgbColor } from "../../../data/RgbColor";
import { Rect } from "../../../geometries/Rect";
import { ModelCollectionBase } from "../Collections";
import { UserInterfaceAdaptable } from "./adapters/UserInterfaceModelAdapter";
import { Model } from "./Model";

export abstract class MenuButtonModel<MODEL_COLLECTION extends ModelCollectionBase, UI_ACTION>
    extends Model<MODEL_COLLECTION>
    implements UserInterfaceAdaptable<UI_ACTION>
{
    // graphics
    public background: RgbColor = tools.commons.Colors.BLUE;
    public foreground: RgbColor = tools.commons.Colors.WHITE;
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
