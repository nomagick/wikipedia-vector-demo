import { HTTPService } from 'civkit/http';


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
    }


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