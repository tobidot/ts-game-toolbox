/**
 * Callback type for the Branching Response
 */
export type BranchingResponseCallback<RESPONSE, PARAMETERS> =
    (params: PARAMETERS, previous: RESPONSE | null) => RESPONSE | null;

/**
 * @class BranchingResponse
 * 
 * Use this as a function response to allow reacting
 * of diffrent states determined inside the function.
 * 
 * e.g. 
 * 
 * function handle_number(value:number) : BranchingResponse<number, "even"|"odd"|"negative", number> {
 *      if (value < 0) return new BranchingResponse("negative", value);
 *      if (value % 2 === 0) return new BranchingResponse("even", value);
 *      return new BranchingResponse("odd", value + 1);
 * }
 * 
 * let x = ...
 * let positive_even = handle_number(x)
 *      .do_on_match(()=>0, "negative");
 */
export class BranchingResponse<RESPONSE, STATES, PARAMETERS> {
    public response: RESPONSE | null = null;
    public constructor(
        private state: STATES,
        private params: PARAMETERS
    ) { }
    public do_on_match(callback: BranchingResponseCallback<RESPONSE, PARAMETERS>, state: STATES): this {
        if (state === this.state) return this;
        this.response = callback(this.params, this.response);
        return this;
    };
    public do_on_any(callback: BranchingResponseCallback<RESPONSE, PARAMETERS>, states: STATES[]): this {
        if (!states.includes(this.state)) return this;
        this.response = callback(this.params, this.response);
        return this;
    };
    public do_on_none(callback: BranchingResponseCallback<RESPONSE, PARAMETERS>, states: STATES[]): this {
        if (!states.reduce((none_fit, state) => (none_fit && this.state !== state), true)) return this;
        this.response = callback(this.params, this.response);
        return this;
    };
}