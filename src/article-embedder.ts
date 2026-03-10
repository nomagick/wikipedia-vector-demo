import { AsyncService } from 'civkit/async-service';
import { GlobalLogger } from './logger';
import { singleton } from 'tsyringe';
import { JinaReaderAPI } from './jina-reader';
import { recursiveChunk } from './chunking';
import { JinaEmbeddingsAPI } from './jina-embeddings';
import { EnvConfig } from './env-config';
import es from '@elastic/elasticsearch';

import type Transformers from '@huggingface/transformers' with {'resolution-mode': 'import'};

interface WikimediaArticle {
    name: string;
    identifier: number;
    abstract: string;
    date_modified: string;
    version: {
        identifier: number;
        comment: string;
        scores: {
            [key: string]: unknown;
        };
        editor: {
            identifier: number;
            name: string;
        };
        number_of_characters: number;
        size: {
            value: number;
            unit_text: string;
        };
    };
    url: string;
    namespace: {
        identifier: number;
    };
    in_language: {
        identifier: string;
    };
    main_entity: {
        identifier: string;
        url: string;
    };
    additional_entities: {
        identifier: string;
        url: string;
        aspects: string[];
    }[];
    categories: { name: string; url: string; }[];
    templates: { name: string; url: string; }[];
    redirects: { name: string; url: string; }[];
    is_part_of: {
        identifier: string;
        url: string;
    };
    article_body: {
        html: string;
        wikitext: string;
    };
    license: {
        name: string;
        identifier: string;
        url: string;
    }[];
    event: {
        identifier: string;
        type: string;
        date_created: string;
        date_published: string;
    };
}

@singleton()
export class ArticleEmbedder extends AsyncService {

    logger = this.globalLogger.child({ service: this.constructor.name });
    readerAPI!: JinaReaderAPI;
    embeddingsAPI!: JinaEmbeddingsAPI;
    esClient!: es.Client;

    transformers!: typeof Transformers;

    esIndexName = 'wikipedia-articles';

    constructor(
        protected globalLogger: GlobalLogger,
        protected envConfig: EnvConfig,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.readerAPI = new JinaReaderAPI(this.envConfig.JINA_API_KEY, this.envConfig.JINA_READER_API_URL || 'http://localhost:3001');
        this.embeddingsAPI = new JinaEmbeddingsAPI(this.envConfig.JINA_API_KEY);
        this.transformers = await import('@huggingface/transformers');
        this.esClient = new es.Client({
            node: this.envConfig.ELASTICSEARCH_URL || 'http://localhost:9200',
            auth: {
                apiKey: this.envConfig.ELASTICSEARCH_API_KEY
            },
            serverMode: 'serverless',
        });
        await this._prepareEsIndex();
        this.emit('ready');
    }

    async processWikimediaArticle(article: WikimediaArticle) {
        const docId = `${article.is_part_of.identifier}-${article.identifier}`;
        const docExists = await this.esClient.exists({
            index: this.esIndexName,
            id: docId,
        });

        if (docExists) {
            return { id: docId, result: 'noop' };
        }

        const read = await this.readerAPI.htmlToMarkdown(article.article_body.html, article.url);

        const chunkedBody = recursiveChunk(read.content)
            .map((x) => {
                const trimmed = x.replaceAll(/\n{2,}/g, '\n\n').trim();
                return trimmed.startsWith(`# ${read.title}`) ? trimmed : `# ${read.title}\n${trimmed}`;
            });

        const brief = `${article.name}\n${article.abstract}`;

        const allChunks = [brief, ...chunkedBody];
        const tasks = ['retrieval.passage', 'text-matching', 'classification'] as const;

        const promises = tasks.map(async (task) => {
            const r = await this.embeddingsAPI.embedText(allChunks, 'jina-embeddings-v5-text-small', task).catch((err) => {
                this.logger.error(`Error embedding text for task ${task}: ${err.message}`, { err });

                return Promise.reject(err);
            });

            const tensors = r.data.map((x) => {
                const buff = Buffer.from(x.embedding, 'base64');
                const arr = new Float32Array(buff.buffer, buff.byteOffset, buff.byteLength / Float32Array.BYTES_PER_ELEMENT);
                return new this.transformers.Tensor('float32', arr, [arr.length]);
            });

            const mean = this.transformers.stack(tensors).mean(0, true).normalize().flatten();

            return {
                task,
                briefTensor: tensors[0],
                briefTensorBase64: this._tensorToElasticBase64(tensors[0]),
                chunkTensors: tensors.slice(1),
                meanTensorNormalized: mean,
                meanTensorNormalizedBase64: this._tensorToElasticBase64(mean),
            };
        });

        const awaited = await Promise.all(promises);

        const doc = {
            name: article.name,
            url: article.url,
            lang: article.in_language.identifier,
            abstract: article.abstract,
            content: read.content,
            updatedAt: article.date_modified,
            categories: article.categories,
            partOf: article.is_part_of.identifier,

            briefRetrieval: awaited.find(x => x.task === 'retrieval.passage')!.briefTensorBase64,
            briefMatching: awaited.find(x => x.task === 'text-matching')!.briefTensorBase64,
            briefClassification: awaited.find(x => x.task === 'classification')!.briefTensorBase64,
            meanRetrieval: awaited.find(x => x.task === 'retrieval.passage')!.meanTensorNormalizedBase64,
            meanMatching: awaited.find(x => x.task === 'text-matching')!.meanTensorNormalizedBase64,
            meanClassification: awaited.find(x => x.task === 'classification')!.meanTensorNormalizedBase64,
        };

        const r = await this.esClient.index({
            index: this.esIndexName,
            id: docId,
            document: doc,
        });


        return { doc, id: r._id, result: r.result };
    }

    _tensorToElasticBase64(tensor: Transformers.Tensor) {
        const arr = tensor.data as Float32Array;
        const buff = Buffer.alloc(arr.length * Float32Array.BYTES_PER_ELEMENT);

        for (let i = 0; i < arr.length; i++) {
            buff.writeFloatBE(arr[i], i * Float32Array.BYTES_PER_ELEMENT);
        }

        return buff.toString('base64');

        // return Array.from(tensor.data as Float32Array);
    }

    async _prepareEsIndex(name: string = this.esIndexName) {
        const rExists = await this.esClient.indices.exists({ index: name });
        if (!rExists) {
            await this.esClient.indices.create({
                index: name,
                mappings: {
                    properties: {
                        name: { type: 'text' },
                        url: { type: 'keyword' },
                        lang: { type: 'keyword' },
                        abstract: { type: 'text' },
                        content: {
                            type: 'semantic_text',
                            index_options: {
                                dense_vector: {
                                    type: 'bbq_disk'
                                }
                            },
                            inference_id: '.jina-embeddings-v5-text-small',
                            chunking_settings: {
                                strategy: 'recursive',
                                separator_group: 'markdown',
                                max_chunk_size: 6114,
                            }
                        },
                        updatedAt: { type: 'date' },
                        categories: {
                            type: 'nested',
                            properties: {
                                name: { type: 'text', index: false },
                                url: { type: 'keyword', index: false },
                            }
                        },
                        partOf: { type: 'keyword' },

                        briefRetrieval: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'bbq_disk',
                            }
                        },
                        briefMatching: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'bbq_disk',
                            }
                        },
                        briefClassification: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'bbq_disk',
                            }
                        },

                        meanRetrieval: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'int8_hnsw'
                            }
                        },
                        meanMatching: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'int8_hnsw'
                            }
                        },
                        meanClassification: {
                            type: 'dense_vector',
                            index: true,
                            similarity: 'dot_product',
                            index_options: {
                                type: 'int8_hnsw'
                            }
                        },
                    }
                }
            });
        }
    }
}