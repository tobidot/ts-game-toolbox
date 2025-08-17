export * from "./mvc/models/Model";
export * from "./mvc/views/View";
export * from "./mvc/controllers/Controller";
export * from "./mvc/views/CanvasView";
export * from "./mvc/helpers/ControllerEvent";
export * from "./mvc/MvcCanvasGame";
export * from "./mvc/models/ModelTable";
export * from "./mvc/helpers/ControllerResponse";
export * from "./mvc/controllers/PromiseController";
export * from "./mvc/events/ControllerEvent";
export * from "./mvc/models/adapters/UserInterfaceModelAdapter";
export * from "./mvc/models/MenuButtonModel";
export * from "./mvc/models/MenuGroupModel";
export * from "./mvc/services/MenuBuilder";

/**
 * @deprecated
 * Will be moved into a separate package.
 * "ts-class-entities"
 */
// const abstract = {
//     mvc: {
//         MvcGame,
//         MvcCanvasGame,
//         helpers: {
//             update_controller_response,
//         },
//         services: {
//             MenuBuilder
//         },
//         models: {
//             Model,
//             ModelTable,
//             MenuButtonModel,
//             MenuGroupModel,
//             adapters: {
//                 UserInterfaceModelAdapter,
//             },
//         },
//         views: {
//             CanvasView,
//             View,
//         },
//         controllers: {
//             Controller,
//             PromiseController
//         },
//         events: {
//             ControllerEventConstructor,
//             is_controller_event,
//             is_specific_controller_event,
//         }
//     },
// };
