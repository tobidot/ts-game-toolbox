import * as tools from "../../../index";
import { RgbColor } from "../../../data/RgbColor";
import { Rect } from "../../../geometries/Rect";
import { CollectionTree } from "../../../trees/Collection";
import { ModelCollectionBase } from "../Collections";
import { UserInterfaceAdaptable } from "./adapters/UserInterfaceModelAdapter";
import { MenuButtonModel } from "./MenuButtonModel";
import { Model } from "./Model";
import { ModelTable } from "./ModelTable";


export class MenuGroupModel<UI_ACTION>
    extends Model<ModelCollectionBaseWithMenuItems<UI_ACTION>>
    implements UserInterfaceAdaptable<UI_ACTION>
{
    // graphics
    public background: RgbColor = tools.Colors.BLUE;
    public foreground: RgbColor = tools.Colors.WHITE;
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

    public get children(): Array<MenuButtonModel<UI_ACTION>> {
        return this.models.menu_buttons.all().filter(
            (button: MenuButtonModel<UI_ACTION>): boolean => {
                return button.parent_group_id === this.id;
            }
        );
    }
}

type MenuButtonModelModelTable<UI_ACTION>
    = ModelTable<MenuButtonModel<UI_ACTION>, 'menu_buttons'>;

type MenuGroupModelModelTable<UI_ACTION>
    = ModelTable<MenuButtonModel<UI_ACTION>, 'menu_groups'>;

type ModelCollectionBaseWithMenuItems<UI_ACTION>
    = ModelCollectionBase & {
        menu_buttons: MenuButtonModelModelTable<UI_ACTION>;
        menu_groups: MenuGroupModelModelTable<UI_ACTION>;
    };