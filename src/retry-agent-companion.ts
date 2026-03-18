import { Deferred, Defer } from 'civkit/defer';

export enum THROTTLER_STATE {
    NOT_THROTTLED = 'not_throttled',
    EXCEPTIONAL = 'exceptional',
    SUPPRESSED = 'suppressed',
    BLOCKED = 'blocked',
}

export class RetryAgentCompanion {

    queue: Deferred<THROTTLER_STATE>[] = [];

    state: THROTTLER_STATE = THROTTLER_STATE.NOT_THROTTLED;

    private _lastBatch = 0;

    hold() {
        this.state = THROTTLER_STATE.BLOCKED;
        this._lastBatch = 0;

        return this.state;
    }

    acquire() {
        if (this.state === THROTTLER_STATE.NOT_THROTTLED) {
            return Promise.resolve();
        }

        const deferred = Defer<THROTTLER_STATE>();
        this.queue.push(deferred);

        return deferred.promise;
    }

    release() {
        if (this.state === THROTTLER_STATE.BLOCKED) {
            this.state = THROTTLER_STATE.EXCEPTIONAL;

            this.queue.shift()?.resolve(this.state);
            this._lastBatch = 1;

            return;
        }

        if (this.state === THROTTLER_STATE.EXCEPTIONAL || this.state === THROTTLER_STATE.SUPPRESSED) {
            this.state = THROTTLER_STATE.SUPPRESSED;
            const thisBatch = this._lastBatch * 2;
            if (thisBatch >= this.queue.length) {
                this.state = THROTTLER_STATE.NOT_THROTTLED;
            }

            this.queue.splice(0, thisBatch).forEach((deferred) => deferred.resolve(this.state));
            this._lastBatch = thisBatch;

            return;
        }

        this.queue.forEach((deferred) => deferred.resolve(this.state));
        this.queue.length = 0;

        return;
    }
}


function calculateRetryAfterHeader(retryAfter: string) {
    const retryTime = new Date(retryAfter).getTime();
    return isNaN(retryTime) ? 0 : retryTime - Date.now();
}
export function retryHandler(err: any, { state, opts }: any, cb: any) {
    const { statusCode, code, headers } = err;
    const { method, retryOptions } = opts;
    const {
        maxRetries,
        minTimeout,
        maxTimeout,
        timeoutFactor,
        statusCodes,
        errorCodes,
        methods
    } = retryOptions;
    const { counter } = state;

    // Any code that is not a Undici's originated and allowed to retry
    if (code && code !== 'UND_ERR_REQ_RETRY' && !errorCodes.includes(code)) {
        cb(err);
        return;
    }

    // If a set of method are provided and the current method is not in the list
    if (Array.isArray(methods) && !methods.includes(method)) {
        cb(err);
        return;
    }

    // If a set of status code are provided and the current status code is not in the list
    if (
        statusCode != null &&
        Array.isArray(statusCodes) &&
        !statusCodes.includes(statusCode)
    ) {
        cb(err);
        return;
    }

    // If we reached the max number of retries
    if (counter > maxRetries) {
        cb(err);
        return;
    }

    let retryAfterHeader = headers?.['retry-after'];
    if (retryAfterHeader) {
        retryAfterHeader = Number(retryAfterHeader);
        retryAfterHeader = Number.isNaN(retryAfterHeader)
            ? calculateRetryAfterHeader(headers['retry-after'])
            : retryAfterHeader * 1e3; // Retry-After is in seconds
    }

    const retryTimeout =
        retryAfterHeader > 0
            ? Math.min(retryAfterHeader, maxTimeout)
            : Math.min(minTimeout * timeoutFactor ** (counter - 1), maxTimeout);

    setTimeout(() => cb(null), retryTimeout);
};
