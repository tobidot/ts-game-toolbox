import { ModelCollectionBase } from "./Collections";

export interface ModelInterface {

}

export class Model<MODEL_COLLECTION extends ModelCollectionBase> implements ModelInterface {
    constructor(protected collection: MODEL_COLLECTION) { }
}