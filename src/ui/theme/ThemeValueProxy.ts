/**
 * A proxied theme value.
 */
export abstract class ThemeValueProxy<T> {
    public abstract cpy(): this;

    public abstract get(): T;

    /**
     * Check if this is the same proxy definition as the given value.
     * @param value
     */
    public abstract equals(value: this): boolean;
}
