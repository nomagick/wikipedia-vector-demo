import { singleton } from 'tsyringe';
import { assignMeta, RPCHost } from 'civkit/civ-rpc';
import { GlobalLogger } from './logger';
import { Method, Param } from './registry';
import { EnvConfig } from './env-config';
import { JinaEmbeddingsAPI } from './jina-embeddings';
import es from '@elastic/elasticsearch';
import type Transformers from '@huggingface/transformers' with {'resolution-mode': 'import'};

export interface EsIndexedArticle {
    title: string;
    url: string;
    abstract: string;
    partOf: string;
    lang: string;

    meanClassification: number[];
    meanMatching: number[];
}

export interface EsIndexedArticleDto {
    title: string;
    url: string;
    abstract: string;
    partOf: string;
    lang: string;

    meanClassification: string;
    meanMatching: string;
}

@singleton()
export class APIHost extends RPCHost {
    title = 'Wikipedia Vector Demo API';
    logger = this.globalLogger.child({ service: this.constructor.name });

    transformers!: typeof Transformers;

    embeddingsAPI!: JinaEmbeddingsAPI;
    esClient!: es.Client;


    esIndexName = 'wikipedia-articles';

    constructor(
        protected globalLogger: GlobalLogger,
        protected envConfig: EnvConfig,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();

        this.embeddingsAPI = new JinaEmbeddingsAPI(this.envConfig.JINA_API_KEY);
        this.transformers = await import('@huggingface/transformers');
        this.esClient = new es.Client({
            node: this.envConfig.ELASTICSEARCH_URL || 'http://localhost:9200',
            auth: {
                apiKey: this.envConfig.ELASTICSEARCH_API_KEY
            },
            serverMode: 'serverless',
        });
        this.emit('ready');
    }

    @Method()
    async textRetrieval(
        @Param('query', { required: true, validate: (v: string) => typeof v === 'string' && v.length > 0 })
        query: string = 'jina ai',
        @Param('index')
        index: 'disk_bbq' | 'hnsw_int8' = 'disk_bbq',
        @Param('hybrid')
        hybrid: boolean = false,
        @Param('rerank')
        rerank: boolean = false,
        @Param('classificationSystem')
        classificationSystem: 'ddc' | 'udc' = 'ddc',

    ) {
        let queryMixin: any = {
            query: {
                match: {
                    content: query
                }
            }
        };

        if (index === 'hnsw_int8') {
            const embedded = await this.embeddingsAPI.embedText([query], 'jina-embeddings-v5-text-small', 'retrieval.query');
            const buff = Buffer.from(embedded.data[0].embedding, 'base64');
            const f32Array = new Float32Array(buff.buffer, buff.byteOffset, buff.length / Float32Array.BYTES_PER_ELEMENT);
            queryMixin = {
                size: 20,
                query: {
                    knn: {
                        field: 'meanRetrieval',
                        query_vector: this._f32ArrayToElasticBase64(f32Array),
                        k: 50,
                        num_candidates: 100,
                    }
                }
            };
        }
        if (hybrid) {
            const mixin = queryMixin.query.knn ? queryMixin.query : { standard: queryMixin };
            queryMixin = {
                retriever: {
                    rrf: {
                        retrievers: [
                            {
                                standard: {
                                    query: {
                                        multi_match: {
                                            query,
                                            fields: ['name', 'abstract'],
                                        }
                                    }
                                }
                            },
                            {
                                ...mixin
                            }
                        ]
                    }
                }

            };
        }

        const results = await this.esClient.search({
            index: this.esIndexName,
            ...queryMixin,
            _source: [
                'name', 'url', 'abstract', 'partOf', 'lang', 'content',
                'meanClassification', 'meanMatching',
            ],
        });

        const pClassifications = this._mixinClassifications(
            results.hits.hits.map(hit => hit._source as EsIndexedArticle),
            classificationSystem === 'ddc' ? 'ddc-categories' : 'udc-categories'
        );

        let series = results.hits.hits;
        if (rerank) {
            const texts = results.hits.hits.map((hit: any) => `${hit._source.name || ''}\n${hit._source.abstract || ''}\n${hit._source.content || ''}`);

            const reranked = await this.embeddingsAPI.reRankTexts(query, texts, 'jina-reranker-v3');

            const newSeries = reranked.results.map((res) => series[res.index]);
            series = newSeries;
        }

        await pClassifications;

        const r = series.map((hit) => {
            return {
                ...this._processDoc(hit._source as EsIndexedArticle),
                _score: hit._score,
                _id: hit._id,
            };
        });

        assignMeta(r, {
            total: typeof results.hits.total === 'number' ? results.hits.total : results.hits.total?.value,
            took: results.took,
        });

        return r;
    }

    @Method()
    async recommend(
        @Param('query', { required: true, validate: (v: string) => Buffer.from(v, 'base64url').byteLength === 4096 })
        query: string = '',
        @Param('classificationSystem')
        classificationSystem: 'ddc' | 'udc' = 'ddc',
    ) {
        const buff = Buffer.from(query, 'base64url');
        const f32Array = new Float32Array(buff.buffer, buff.byteOffset, buff.length / Float32Array.BYTES_PER_ELEMENT);

        const results = await this.esClient.search({
            index: this.esIndexName,
            query: {
                knn: {
                    field: 'meanMatching',
                    query_vector: this._f32ArrayToElasticBase64(f32Array) as any,
                }
            },
            _source: [
                'name', 'url', 'abstract', 'partOf', 'lang',
                'meanClassification', 'meanMatching',
            ],
        });

        await this._mixinClassifications(
            results.hits.hits.map(hit => hit._source as EsIndexedArticle),
            classificationSystem === 'ddc' ? 'ddc-categories' : 'udc-categories'
        );

        const r = results.hits.hits.map((hit) => {
            return {
                ...this._processDoc(hit._source as EsIndexedArticle),
                _score: hit._score,
                _id: hit._id,
            };
        });

        assignMeta(r, {
            total: typeof results.hits.total === 'number' ? results.hits.total : results.hits.total?.value,
            took: results.took,
        });

        return r;
    }

    @Method()
    async category(
        @Param('query', { required: true, validate: (v: string) => Buffer.from(v, 'base64url').byteLength === 4096 })
        query: string = '',
        @Param('classificationSystem')
        classificationSystem: 'ddc' | 'udc' = 'ddc',
    ) {
        const buff = Buffer.from(query, 'base64url');
        const f32Array = new Float32Array(buff.buffer, buff.byteOffset, buff.length / Float32Array.BYTES_PER_ELEMENT);

        const results = await this.esClient.search({
            index: this.esIndexName,
            query: {
                knn: {
                    field: 'meanClassification',
                    query_vector: this._f32ArrayToElasticBase64(f32Array) as any,
                }
            },
            _source: [
                'name', 'url', 'abstract', 'partOf', 'lang',
                'meanClassification', 'meanMatching',
            ],
        });

        await this._mixinClassifications(
            results.hits.hits.map(hit => hit._source as EsIndexedArticle),
            classificationSystem === 'ddc' ? 'ddc-categories' : 'udc-categories'
        );

        const r = results.hits.hits.map((hit) => {
            return {
                ...this._processDoc(hit._source as EsIndexedArticle),
                _score: hit._score,
                _id: hit._id,
            };
        });

        assignMeta(r, {
            total: typeof results.hits.total === 'number' ? results.hits.total : results.hits.total?.value,
            took: results.took,
        });

        return r;
    }

    async _mixinClassifications(docs: EsIndexedArticle[], categoryIndex: 'udc-categories' | 'ddc-categories' = 'udc-categories') {
        const ops = docs.flatMap((doc) => {
            const op = {
                size: 3,
                _source: ['name', 'identifier', 'vector'],
                query: {
                    knn: {
                        field: 'vector',
                        query_vector: this._f32ArrayToElasticBase64(doc.meanClassification),
                    }
                }
            };

            return [{ index: categoryIndex }, op];
        });

        const r = await this.esClient.msearch({
            searches: ops as any[]
        });

        r.responses.forEach((resp, idx) => {
            if (resp.status !== 200) {
                return;
            }
            const hits = (resp as any).hits.hits;
            const classifications = hits.map((hit: any) => {
                return {
                    ...hit._source,
                    vector: Buffer.from(Float32Array.from(hit._source.vector).buffer).toString('base64'),
                };
            }).filter(Boolean);
            Reflect.set(docs[idx], 'dcCategories', classifications);

        });

        return r;
    }

    _processDoc(doc: EsIndexedArticle) {
        for (const key of ['meanClassification', 'meanMatching'] as const) {
            if (doc[key] && Array.isArray(doc[key])) {
                // To base64
                Reflect.set(doc, key, Buffer.from(Float32Array.from(doc[key]).buffer).toString('base64url'));
            }
        }

        const r = { ...doc };
        Reflect.deleteProperty(r, 'content');

        return r as any as EsIndexedArticleDto;
    }

    _f32ArrayToElasticBase64(tensor: number[] | Float32Array) {
        const arr = Float32Array.from(tensor);
        const buff = Buffer.alloc(arr.length * Float32Array.BYTES_PER_ELEMENT);

        for (let i = 0; i < arr.length; i++) {
            buff.writeFloatBE(arr[i], i * Float32Array.BYTES_PER_ELEMENT);
        }

        return buff.toString('base64');

        // return Array.from(tensor.data as Float32Array);
    }
}
