import { tools } from "../../../../index";
import { RgbColor } from "../../../data/RgbColor";
import { Rect } from "../../../geometries/Rect";
import { ModelCollectionBase } from "../Collections";
import { UserInterfaceAdaptable } from "./adapters/UserInterfaceModelAdapter";
import { MenuButtonModel } from "./MenuButtonModel";
import { Model } from "./Model";
import { ModelTable } from "./ModelTable";


export class MenuGroupModel<
    MODEL_COLLECTION extends ModelCollectionBaseWithMenuItems<UI_ACTION>, UI_ACTION
    >
    extends Model<MODEL_COLLECTION>
    implements UserInterfaceAdaptable<UI_ACTION>
{
    // graphics
    public background: RgbColor = tools.commons.Colors.BLUE;
    public foreground: RgbColor = tools.commons.Colors.WHITE;
    public is_visible: boolean = true;
    public title: string = "Menu Group";
    // logic
    public static next_id = 1;
    public id: number = MenuGroupModel.next_id++;
    public z_index: number = 0;
    public toggle_button_id: number | null = null;
    public collider: Rect = new Rect(0, 0, 0, 0);

    public get is_clickable(): boolean {
        return this.is_visible;
    }

    public click(): UI_ACTION | null {
        return null;
    }

    public get children(): Array<MenuButtonModel<ModelCollectionBaseWithMenuItems<UI_ACTION>, UI_ACTION>> {
        return this.models.menu_buttons.all().filter(
            (button: MenuButtonModel<ModelCollectionBaseWithMenuItems<UI_ACTION>, UI_ACTION>) => {
                return button.parent_group_id === this.id;
            }
        );
    }
}

type MenuButtonModelModelTable<UI_ACTION> = ModelTable<
    ModelCollectionBaseWithMenuItems<UI_ACTION>,
    MenuButtonModel<ModelCollectionBaseWithMenuItems<UI_ACTION>, UI_ACTION>
>;

type MenuGroupModelModelTable<UI_ACTION> = ModelTable<
    ModelCollectionBaseWithMenuItems<UI_ACTION>,
    MenuGroupModel<ModelCollectionBaseWithMenuItems<UI_ACTION>, UI_ACTION>
>;

type ModelCollectionBaseWithMenuItems<UI_ACTION> = ModelCollectionBase & {
    menu_buttons: MenuButtonModelModelTable<UI_ACTION>;
    menu_groups: MenuGroupModelModelTable<UI_ACTION>;
}