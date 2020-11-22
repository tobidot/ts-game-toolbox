export class ChainProperty<VIEW, PROPERTY> {
    public constructor(protected view: VIEW, protected property: PROPERTY) { }
    public set(value: PROPERTY): VIEW {
        this.property = value;
        return this.view;
    }
    public get(): PROPERTY {
        return this.property;
    }
}

export var CP = ChainProperty;