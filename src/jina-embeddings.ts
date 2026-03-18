import { HTTPService } from 'civkit/http';
import { RetryAgent, Agent } from 'undici';
import { RetryAgentCompanion, retryHandler, THROTTLER_STATE } from './retry-agent-companion';


export interface JinaEmbeddingsResponse<T extends number[] | string = number[]> {
    model: string;
    object: string;
    usage: {
        total_tokens: number;
    };
    data: {
        object: string;
        index: number;
        embedding: T;
    }[];
}

export interface JinaReRankResponse {
    model: string;
    object: string;
    usage: {
        total_tokens: number;
    };
    results: { index: number; relevance_score: number; }[];
}


export class JinaEmbeddingsAPI extends HTTPService {

    companion: RetryAgentCompanion;

    constructor(apiKey: string) {
        super('https://api.jina.ai');
        if (apiKey) {
            this.baseOptions.headers = {
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            };
        }

        this.companion = new RetryAgentCompanion();

        this.baseOptions.timeout = 180_000;
        this.baseOptions.dispatcher = new RetryAgent(new Agent(), {
            statusCodes: [429, 503],
            maxRetries: 60,
            retryAfter: true,
            minTimeout: 500,
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

    async embedText(texts: string[], model: string, task?: string) {
        await this.companion.acquire();
        const r = await this.postJson<JinaEmbeddingsResponse<string>>('/v1/embeddings', {
            model,
            task,
            truncate: true,
            normalized: true,
            embedding_type: 'base64',
            input: texts,
        }).finally(() => {
            this.companion.release();
        });

        return r.data;
    }

    async reRankTexts(query: string, texts: string[], model: string) {
        await this.companion.acquire();
        const r = await this.postJson<JinaReRankResponse>('/v1/rerank', {
            model,
            query,
            top_n: texts.length,
            documents: texts,
            max_doc_length: 2048,
            truncate: true,
            return_documents: false,
        }).finally(() => {
            this.companion.release();
        });

        return r.data;
    }

}
