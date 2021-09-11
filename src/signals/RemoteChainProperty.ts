import { ChainProperty } from "./ChainProperty";


/**
 * Similar to @see ChainProperty this class allows for easy chain setting attributes.
 * This class howver does not define the property that can be chained.
 * Instead it is applied to the parent object with a key to reference the chained property.
 * 
 * ```
 * class Foo {
 *  bar = new CP<Foo, number>(this,0);
 * }
 * class Parent {
 *  remote_bar = new RemoteChainProperty(this, Foo, 'bar');
 * }
 * const p = new Parent();
 * p.remote_bar.set(15);
 * p.remote_bat.get();      // > 15
 * ```
 */
export class RemoteChainProperty<
    PARENT,
    REMOTE_CLASS extends { [K in REMOTE_KEY]: ChainProperty<REMOTE_CLASS, any> },
    REMOTE_KEY extends KeysOfType<REMOTE_CLASS, ChainProperty<REMOTE_CLASS, any>>,
    PROPERTY_TYPE extends ChainPropertyType<REMOTE_CLASS, REMOTE_CLASS[REMOTE_KEY]> = ChainPropertyType<REMOTE_CLASS, REMOTE_CLASS[REMOTE_KEY]>
    > {
    public constructor(
        protected parent: PARENT,
        protected remote: REMOTE_CLASS,
        protected key: REMOTE_KEY
    ) {
    }

    /**
     * Set the value of the property 
     * @param value 
     * @returns 
     */
    public set(value: PROPERTY_TYPE): PARENT {
        this.remote[this.key].set(value);
        return this.parent;
    }

    /**
     * Get the value of the property
     * @returns The value of the property
     */
    public get(): PROPERTY_TYPE {
        return this.remote[this.key].get();
    }
}

/**
 * Helper type to determine all keys in a class that are of a certain type
 */
type KeysOfType<CLASS, TYPE> = {
    [K in keyof CLASS]: CLASS[K] extends TYPE
    ? K
    : never
}[keyof CLASS];

/**
 * Helper Type to infer the Property Type of a chained property
 */
type ChainPropertyType<CLASS, T> =
    T extends ChainProperty<CLASS, infer PROP>
    ? PROP
    : never;

/// alias 
export var RCP = RemoteChainProperty;

