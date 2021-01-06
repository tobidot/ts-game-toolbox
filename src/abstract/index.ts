import { Model } from "./mvc/Model";
import { View } from "./mvc/View";
import { Controller } from "./mvc/Controller";
import { CanvasView } from "./mvc/CanvasView";
import { ControllerEventConstructor } from "./mvc/helpers/ControllerEvent";
import { MvcGame as MvcGame } from "./mvc/MVCgame";
import { MvcCanvasGame } from "./mvc/MvcCanvasGame";
import { ModelTable } from "./mvc/ModelTable";
import { update_controller_response } from "./mvc/helpers/ControllerResponse";
import { PromiseController } from "./mvc/controllers/PromiseController";


export var abstract = {
    mvc: {
        MvcGame,
        MvcCanvasGame,
        CanvasView,
        Model,
        ModelTable,
        View,
        Controller,
        helpers: {
            ControllerEventConstructor,
            update_controller_response,
        },
        controllers: {
            PromiseController
        },
    },
};