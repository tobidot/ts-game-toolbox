/**
 * Wraps a property type to make it easily chainable when accessed from the outside,
 * By keeping a reference to the outside object and returning it in the set call.
 * 
 * @template OBJECT the type of the parent object
 * @template PROPERTY the type of this property
 * 
 * Example:
 * ```
 * class Zoo {
 *  foo = new CP<Zoo, number>(this,0);
 *  bar = new CP<Zoo, string>(this,"hello");
 * };
 * const inst = new Zoo();
 * inst
 *  .foo.set(5)
 *  .bar.set("hey");
 * ```
 */
export class ChainProperty<OBJECT, PROPERTY> {
    /**
     * Creates a new Chainable Property
     * @param object The parent object
     * @param property The property to set
     */
    public constructor(
        protected object: OBJECT,
        protected property: PROPERTY
    ) { }

    /**
     * Sets the value of the property
     * @param value 
     * @returns The parent object
     */
    public set(value: PROPERTY): OBJECT {
        this.property = value;
        return this.object;
    }

    /**
     * Returns the value of the property
     * @returns Value of the property
     */
    public get(): PROPERTY {
        return this.property;
    }
}

export var CP = ChainProperty;