import { ChainProperty } from "./ChainProperty";

type ChainPropertyType<CLASS, T> = T extends ChainProperty<CLASS, infer PROP>
    ? PROP
    : never;

export class RemoteChainProperty<
    CHAIN,
    REMOTE_CLASS extends { [K in REMOTE_KEY]: ChainProperty<REMOTE_CLASS, any> },
    REMOTE_KEY extends KeysOfType<REMOTE_CLASS, ChainProperty<REMOTE_CLASS, any>>,
    PROPERTY_TYPE extends ChainPropertyType<REMOTE_CLASS, REMOTE_CLASS[REMOTE_KEY]> = ChainPropertyType<REMOTE_CLASS, REMOTE_CLASS[REMOTE_KEY]>
    > {
    public constructor(
        protected chain: CHAIN,
        protected remote: REMOTE_CLASS,
        protected key: REMOTE_KEY
    ) {
    }
    public set(value: PROPERTY_TYPE): CHAIN {
        this.remote[this.key].set(value);
        return this.chain;
    }
    public get(): PROPERTY_TYPE {
        return this.remote[this.key].get();
    }
}

type KeysOfType<CLASS, TYPE> = {
    [K in keyof CLASS]: CLASS[K] extends TYPE
    ? K
    : never
}[keyof CLASS];

export var RCP = RemoteChainProperty;