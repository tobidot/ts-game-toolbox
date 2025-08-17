import assert from "assert";
import { sleep } from "../async/Sleep";
import { Throttler } from "./Throttler";
import { expect } from "chai";

describe('Throttler', () => {
    /**
     * Make sure the result is received at the caller
     */
    it('returns result', async () => {
        // declare definitions
        const _CALLBACK_SLEEP = 100;
        const _MAX_TIMEOUT = 200;

        // declare helper
        const callback = async () => {
            await sleep(_CALLBACK_SLEEP);
            return 1;
        };
        const throttler = new Throttler({
            strategy: Throttler.STRATEGIES.COMBINE,
            callback,
            delay_ms: 0,
            wake_up_ms: 0
        });

        // run the test
        const now = performance.now();
        const result = await throttler.run();
        const elapsed = performance.now() - now;

        // Run assertions
        expect(result).to.equal(1, "The return value should be the same as the callback has returned.");
        expect(elapsed).to.be.lessThan(_MAX_TIMEOUT, "The call should have taken less than 110ms.");
    });

    /**
     * Make sure the throttline mechanic works as intended
     */
    it('combines multiple calls', async () => {
        // declare definitions
        const _FIRST_RETURN = Math.random();
        const _LAST_RETURN = Math.random();
        const _ITERATIONS = 10;
        const _CALLBACK_SLEEP = 100;
        const _MAX_TIMEOUT = 200;

        // declare helper
        let count_callback = 0;
        let count_after = 0;
        const callback = async (input:number) => {
            await sleep(_CALLBACK_SLEEP);
            count_callback++;
            return input;
        };
        const throttler = new Throttler({
            callback,
            delay_ms: 0,
            wake_up_ms: 0
        });

        // run the test
        const now = performance.now();
        const first_promise = throttler.run(_FIRST_RETURN);
        for (let i = 0; i < _ITERATIONS; i++) {
            throttler.run(i).then(result => count_after++);
        }
        const last_promise = throttler.run(_LAST_RETURN);
        const first_result = await first_promise;
        const last_result = await last_promise;
        const elapsed = performance.now() - now;

        // Run assertions
        expect(first_result).to.equal(_FIRST_RETURN, "All return values should be from the first call.");
        expect(last_result).to.equal(_FIRST_RETURN, "All return values should be from the first call.");
        expect(count_callback).to.equal(1, "The callback sohuld only have been called once.");
        expect(count_after).to.equal(_ITERATIONS, "The then method should have been called 10 times.");
        expect(elapsed).to.be.lessThan(_MAX_TIMEOUT, "The call should have taken less than 110ms.");
    });

    
    /**
     * Check two throttled calls with a delay in between
     */
    it('combines multiple calls', async () => {
        // declare definitions
        const _FIRST_RETURN = Math.random();
        const _SECOND_RETURN = Math.random();
        const _LAST_RETURN = Math.random();
        const _ITERATIONS = 3;
        const _CALLBACK_SLEEP = 30;
        const _BREAK_SLEEP = 200;
        const _MAX_TIMEOUT = _BREAK_SLEEP + _CALLBACK_SLEEP + 50; // 50 ms buffer

        // declare helper
        let count_callback = 0;
        let count_after = 0;
        const callback = async (input:number) => {
            await sleep(_CALLBACK_SLEEP);
            count_callback++;
            return input;
        };
        const throttler = new Throttler({
            callback,
            delay_ms: 0,
            wake_up_ms: 0
        });

        // run the test
        const now = performance.now();
        const first_promise = throttler.run(_FIRST_RETURN);
        for (let i = 0; i < _ITERATIONS; i++) {
            throttler.run(i).then(result => count_after++);
        }
        await sleep(_BREAK_SLEEP);
        const second_promise = throttler.run(_SECOND_RETURN);
        for (let i = 0; i < _ITERATIONS; i++) {
            throttler.run(i).then(result => count_after++);
        }
        const last_promise = throttler.run(_LAST_RETURN);
        // 
        const first_result = await first_promise;
        const second_result = await second_promise;
        const last_result = await last_promise;
        const elapsed = performance.now() - now;

        // Run assertions
        expect(first_result).to.equal(_FIRST_RETURN, "The first call should get its result ready.");
        expect(second_result).to.equal(_SECOND_RETURN, "The second call should get the second return value.");
        expect(last_result).to.equal(_SECOND_RETURN, "The last call should still be throttled and therefor have the second value.");
        expect(count_callback).to.equal(2, "The callback should have time to be called twice.");
        expect(count_after).to.equal(_ITERATIONS * 2);
        expect(elapsed).to.be.lessThan(_MAX_TIMEOUT);
    });
})