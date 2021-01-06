import { EventControllerInterface, ControllerInterface } from "../Controller";
import { ControllerEvent } from "../ControllerEvent";
import { ControllerRouteResponseType, ControllerRouteResponse } from "../ControllerRouteResponse";
import { update_controller_response } from "../helpers/ControllerResponse";
import { ViewInterface } from "../View";


export interface PromisableController {
    next: null | (() => ControllerRouteResponseType);
}

export type PromisableControllerRouteResponseType = ControllerRouteResponseType & { controller: PromisableController };
export type PromisableControllerRouteResponse = null | ViewInterface | (EventControllerInterface & PromisableController) | ControllerEvent | PromisableControllerRouteResponseType;
type PromiseResolver = () => PromisableControllerRouteResponseType;
type NonPromiseResolver = () => (ControllerRouteResponseType);

export class PromiseController implements ControllerRouteResponseType {
    protected next: PromiseController | null = null;
    protected resolver: PromiseResolver;
    protected cached_response: ControllerRouteResponseType | null = null;

    public constructor(resolver: PromiseResolver | PromisableControllerRouteResponseType) {
        this.resolver = this.create_resolver_function(resolver);
    }

    protected create_resolver_function(resolver: PromiseResolver | PromisableControllerRouteResponseType): PromiseResolver {
        return () => {
            const response: PromisableControllerRouteResponseType = (typeof resolver === "object") ? resolver : resolver();
            response.controller.next = this.create_controller_next_function(response);
            return response;
        };
    }

    protected create_controller_next_function(response: PromisableControllerRouteResponseType) {
        return () => {
            if (this.next === null) return this;
            this.resolver = this.next.resolver;
            this.cached_response = null;
            this.next = this.next.next;
            return this;
        };
    }

    protected get response(): ControllerRouteResponseType {
        if (this.cached_response) return this.cached_response;
        const response: (ControllerRouteResponse) = this.resolver();
        this.cached_response = {};
        update_controller_response(this.cached_response, response);
        return this.cached_response;
    }

    public get view(): ViewInterface | null | undefined {
        return this.response?.view;
    }

    public get controller(): ControllerInterface | null | undefined {
        return this.response?.controller;
    }

    public get events(): Array<ControllerEvent> | undefined {
        return this.response?.events;
    }

    public then(resolve: PromiseResolver | PromisableControllerRouteResponseType | PromiseController): PromiseController {
        if (this.next) {
            this.next.then(resolve);
        } else {
            if (resolve instanceof PromiseController) {
                this.next = resolve;
            } else {
                this.next = new PromiseController(resolve);
            }
        }
        return this;
    }

    public finaly(resolve: NonPromiseResolver | ControllerRouteResponseType): PromiseController {
        if (this.next) {
            this.next.finaly(resolve);
        } else {
            this.next = new FinalPromiseController(resolve);
        }
        return this;
    }
}

export class FinalPromiseController extends PromiseController {
    public constructor(resolver: NonPromiseResolver | ControllerRouteResponseType) {
        super((): PromisableControllerRouteResponseType => {
            const response: ControllerRouteResponseType = (typeof resolver === "object") ? resolver : resolver();
            return response as PromisableControllerRouteResponseType;
        });
    }

    protected create_resolver_function(resolver: PromiseResolver | PromisableControllerRouteResponseType): PromiseResolver {
        return () => {
            return (typeof resolver === "object") ? resolver : resolver();
        };
    }
}
