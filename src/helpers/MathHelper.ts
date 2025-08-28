export class MathHelper {

    // value at which two floats are considered equal
    static epsilon = 0.001;

    public static float_equals(
        a: number,
        b: number,
    ): boolean {
        return Math.abs(a - b) < this.epsilon;
    }

}