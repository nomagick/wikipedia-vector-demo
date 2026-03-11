import { retry } from 'civkit/decorators';
import { HTTPService } from 'civkit/http';
import { RetryAgent, Agent } from 'undici';


export interface JinaReadResponse {
    code: number;
    status: number;
    data: {
        title: string;
        url: string;
        description: string;
        content: string;
        metadata?: { [key: string]: string; };
        external?: { [key: string]: { [k: string]: string; }; };
        usage: {
            tokens: number;
        };
    };
    meta: {
        usage: {
            tokens: number;
        };
        [k: string]: unknown;
    };
}


export class JinaReaderAPI extends HTTPService {

    constructor(apiKey?: string, baseUrl: string = 'https://r.jina.ai') {
        super(baseUrl);
        if (apiKey) {
            this.baseOptions.headers = {
                Accept: 'application/json',
                Authorization: `Bearer ${apiKey}`,
            };
        }

        this.baseOptions.timeout = 180_000;
        this.baseOptions.dispatcher = new RetryAgent(new Agent(), {
            statusCodes: [429, 503],
            maxRetries: 3,
            retryAfter: true,
            minTimeout: 100,
        }) as any;
    }


    @retry(2)
    async htmlToMarkdown(html: string, url?: string) {
        const r = await this.postJson<JinaReadResponse>('/', {
            html,
            url,
            respondWith: 'markdown',
        }, {
            responseType: 'json',
        });

        return r.data.data;
    }

}