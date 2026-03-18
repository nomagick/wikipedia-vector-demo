import { HTTPService } from 'civkit/http';
import { RetryAgent, Agent } from 'undici';
import { RetryAgentCompanion, retryHandler, THROTTLER_STATE } from './retry-agent-companion';

export class ElasticSearchAPI extends HTTPService {

    companion: RetryAgentCompanion;

    constructor(esNode: string, apiKey: string) {
        super(esNode);
        if (apiKey) {
            this.baseOptions.headers = {
                Accept: 'application/json',
                Authorization: `ApiKey ${apiKey}`,
            };
        }

        this.companion = new RetryAgentCompanion();

        this.baseOptions.timeout = 180_000;
        this.baseOptions.dispatcher = new RetryAgent(new Agent(), {
            statusCodes: [429, 503, 500],
            maxRetries: 300,
            retryAfter: true,
            minTimeout: 1000,
            retry: (err, opts, cb) => {
                const { statusCode } = err as any;
                if (statusCode === 429 || statusCode === 503) {
                    if (this.companion.state === THROTTLER_STATE.BLOCKED) {
                        this.companion.acquire().then(() => cb(null), cb);
                        return;
                    }
                    this.companion.hold();
                }

                retryHandler(err, opts, cb);
            },
        }) as any;
    }

}
