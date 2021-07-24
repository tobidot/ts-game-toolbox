import { Model } from "./mvc/models/Model";
import { View } from "./mvc/views/View";
import { Controller } from "./mvc/controllers/Controller";
import { CanvasView } from "./mvc/views/CanvasView";
import { ControllerEventConstructor } from "./mvc/helpers/ControllerEvent";
import { MvcGame as MvcGame } from "./mvc/MVCgame";
import { MvcCanvasGame } from "./mvc/MvcCanvasGame";
import { ModelTable } from "./mvc/models/ModelTable";
import { update_controller_response } from "./mvc/helpers/ControllerResponse";
import { PromiseController } from "./mvc/controllers/PromiseController";
import { is_specific_controller_event, is_controller_event } from "./mvc/events/ControllerEvent";
import { UserInterfaceModelAdapter } from "./mvc/models/adapters/UserInterfaceModelAdapter";
import { MenuButtonModel } from "./mvc/models/MenuButtonModel";
import { MenuGroupModel } from "./mvc/models/MenuGroupModel";
// import { MenuBuilder } from "./mvc/services/MenuBuilder";

export var abstract = {
    mvc: {
        MvcGame,
        MvcCanvasGame,
        helpers: {
            update_controller_response,
        },
        services: {
            // MenuBuilder
        },
        models: {
            Model,
            ModelTable,
            MenuButtonModel,
            MenuGroupModel,
            adapters: {
                UserInterfaceModelAdapter,
            },
        },
        views: {
            CanvasView,
            View,
        },
        controllers: {
            Controller,
            PromiseController
        },
        events: {
            ControllerEventConstructor,
            is_controller_event,
            is_specific_controller_event,
        }
    },
};