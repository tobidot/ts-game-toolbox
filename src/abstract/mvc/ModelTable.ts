import { ModelCollectionBase } from "./Collections";
import { ModelInterface } from "./Model";

interface ModelClass<MODEL_COLLECTION extends ModelCollectionBase, MODEL> {
    new(collection: MODEL_COLLECTION): MODEL
}

export class ModelTable<MODEL_COLLECTION extends ModelCollectionBase, MODEL extends ModelInterface> {
    protected models: Array<MODEL> = [];
    protected model_collection: MODEL_COLLECTION;
    protected model_class: ModelClass<MODEL_COLLECTION, MODEL>;

    public constructor(model_collection: MODEL_COLLECTION, model_class: ModelClass<MODEL_COLLECTION, MODEL>) {
        this.model_collection = model_collection;
        this.model_class = model_class;
    }

    public insert_new(): MODEL {
        return this.insert(new this.model_class(this.model_collection));
    }

    public insert(model: MODEL): MODEL {
        this.models.push(model);
        return model;
    }

    public delete(model: MODEL): void {
        this.models = this.models.filter((current) => model !== current);
    }

    public all(): Array<MODEL> {
        return this.models;
    }

    public map(callback: (model: MODEL) => MODEL): void {
        this.models = this.models.map(callback);
    }
}