import { Rect } from "../../../geometries/Rect";
import { Vector2I } from "../../../geometries/Vector2";
import { ModelCollectionBase } from "../Collections";
import { MenuButtonModel } from "../models/MenuButtonModel";
import { MenuGroupModel } from "../models/MenuGroupModel";
import { ModelTable } from "../models/ModelTable";

type MenuBuilderButtonDefinition<T> = T;

interface MenuBuilderGroupDefinition<UI_ACTION> {
    items: {
        [title: string]: MenuBuilderGroupDefinition<UI_ACTION> | MenuBuilderButtonDefinition<UI_ACTION>;
    }
    options?: MenuBuilderGroupOptions
};

interface MenuBuilderOptions {
    direction: "row" | "collumn";
    button_width: number,
    button_height: number,
    button_padding: number,
    group_padding: number,
    group_offset_x: number;
    group_offset_y: number;
}

interface MenuBuilderGroupOptions {
    position?: Vector2I,
    direction?: "row" | "collumn",
}

export class MenuBuilder
    <UI_ACTION extends number | string
    , COLLECTION extends ModelCollectionBaseWithMenuItems<UI_ACTION>
    , GROUPS_TABLE extends ModelTable<COLLECTION, MenuGroupModel<COLLECTION, UI_ACTION>>
    = ModelTable<COLLECTION, MenuGroupModel<COLLECTION, UI_ACTION>>
    , BUTTONS_TABLE extends ModelTable<COLLECTION, MenuButtonModel<COLLECTION, UI_ACTION>>
    = ModelTable<COLLECTION, MenuButtonModel<COLLECTION, UI_ACTION>>
    > {

    public config: MenuBuilderOptions = {
        button_width: 150,
        button_height: 25,
        button_padding: 5,
        group_padding: 10,
        group_offset_x: 10,
        group_offset_y: 10,
        direction: "collumn",
    };

    public constructor(
        protected groups: GROUPS_TABLE,
        protected buttons: BUTTONS_TABLE,
        protected toggle_action_id: UI_ACTION,
    ) {

    }

    public set_config(config: Partial<MenuBuilderOptions>) {
        Object.assign(this.config, config);
    }

    public from_object(
        title: string,
        menu_structure: MenuBuilderGroupDefinition<UI_ACTION>
    ): MenuGroupModel<COLLECTION, UI_ACTION> {
        let entries = Object.entries(menu_structure.items);

        let group = this.groups.insert_new((group) => {
            group.title = title;
            group.is_visible = false;
            group.collider = this.get_collider_for_group(entries.length, menu_structure.options);
            return group;
        });

        entries.forEach(([title, content]) => {
            if (typeof content !== "object") {
                this.add_button_to_group(group, title, content, menu_structure.options);
            } else {
                this.add_group_to_group(group, title, content, menu_structure.options);
            }
        })

        return group;
    }


    public add_button_to_group(group: MenuGroupModel<COLLECTION, UI_ACTION>, title: string, content: UI_ACTION, options?: MenuBuilderGroupOptions) {
        return this.buttons.insert_new((button) => {
            button.parent_group_id = group.id;
            button.title = title;
            button.action_id = content;
            button.is_visible = true;
            button.collider = this.get_collider_for_nth_button(group.children.length, options);
            return button;
        });
    }

    public add_group_to_group(group: MenuGroupModel<COLLECTION, UI_ACTION>, title: string, content: MenuBuilderGroupDefinition<UI_ACTION>, options?: MenuBuilderGroupOptions) {
        const button = this.add_button_to_group(group, title, this.toggle_action_id, options);
        // inner group
        let inner_group = this.from_object(title, content);
        inner_group.collider.x += button.collider.x + group.collider.x;
        inner_group.collider.y += button.collider.y + group.collider.y;
        inner_group.toggle_button_id = button.id;
        inner_group.z_index += group.z_index + 1;
        return inner_group;
    }


    public get_collider_for_group(children_count: number, options?: MenuBuilderGroupOptions): Rect {
        const option_direction = options?.direction ?? this.config.direction;
        const x = (options?.position?.x ?? this.config.group_offset_x);
        const y = (options?.position?.y ?? this.config.group_offset_y);
        if (option_direction === "row") {
            const w = children_count * (this.config.button_width + this.config.button_padding) + this.config.button_padding;
            const h = this.config.button_height + this.config.group_padding * 2;
            return new Rect(x, y, w, h);
        }
        const w = this.config.button_width + this.config.group_padding * 2;
        const h = children_count * (this.config.button_height + this.config.button_padding) + this.config.button_padding;
        return new Rect(x, y, w, h);
    }

    public get_collider_for_nth_button(index: number, options?: MenuBuilderGroupOptions): Rect {
        const option_direction = options?.direction ?? this.config.direction;
        const w = this.config.button_width;
        const h = this.config.button_height;
        if (option_direction === "row") {
            const x = this.config.button_padding + (this.config.button_width + this.config.button_padding) * index;
            const y = this.config.group_padding;
            return new Rect(x, y, w, h);
        }
        const x = this.config.group_padding;
        const y = this.config.button_padding + (this.config.button_height + this.config.button_padding) * index;
        return new Rect(x, y, w, h);
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
