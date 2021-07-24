import { ModelCollectionBase } from "../Collections";
import { ModelInterface } from "./Model";

interface ModelClass<MODEL_COLLECTION extends ModelCollectionBase, MODEL> {
    new(collection: MODEL_COLLECTION): MODEL
}

type ModelCollection<MODEL extends ModelInterface, TABLE_NAME extends string>
    = Record<TABLE_NAME, ModelTable<MODEL, TABLE_NAME>>;

export class ModelTable
    <MODEL extends ModelInterface
    , TABLE_NAME extends string
    > {
    protected models: Array<MODEL> = [];
    protected model_collection: ModelCollection<MODEL, TABLE_NAME>;
    protected model_class: ModelClass<ModelCollection<MODEL, TABLE_NAME>, MODEL>;

    public constructor(model_collection: ModelCollection<MODEL, TABLE_NAME>, model_class: ModelClass<ModelCollection<MODEL, TABLE_NAME>, MODEL>) {
        this.model_collection = model_collection;
        this.model_class = model_class;
    }

    public insert_new(modify?: (model: MODEL) => MODEL): MODEL {
        return this.insert(modify
            ? modify(new this.model_class(this.model_collection))
            : new this.model_class(this.model_collection)
        );
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

    public filter(callback: (model: MODEL) => boolean): void {
        this.models = this.models.filter(callback);
    }

    public map(callback: (model: MODEL) => MODEL): void {
        this.models = this.models.map(callback);
    }

    public for_each(callback: (model: MODEL) => void) {
        this.models.forEach(callback);
    }

    /**
     * Return a filtered array of models
     *
     * @param property
     * @param expected_value
     */
    public where<T extends keyof MODEL, V extends NotAFunction<MODEL[T]>>(
        property: T,
        expected_value: V | ((found_value: MODEL[T]) => boolean)
    ): Array<MODEL> {
        let callback: (model: MODEL) => boolean;
        if (expected_value instanceof Function) {
            callback = (model: MODEL) => expected_value(model[property]);
        } else {
            callback = (model: MODEL) => model[property] === expected_value;
        }
        return this.models.filter(callback);
    }
}

type NotAFunction<T> = T extends Function ? never : T;