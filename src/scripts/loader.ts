import 'reflect-metadata';
import { DataLoader } from '../data-loader';
import { container, singleton } from 'tsyringe';
import { ArticleEmbedder } from '../article-embedder';
import { AsyncService } from 'civkit/async-service';
import { PromiseThrottle } from 'civkit/throttle';
import { GlobalLogger } from '../logger';
import { writeFileSync } from 'fs';
import path from 'path';
import { readFile } from 'fs/promises';
import { program } from 'commander';

program
    .description('Wikipedia Article Embedder and Indexer')
    .option('-c, --concurrency <number>', 'Number of concurrent article processing', '5')
    .argument('<files...>', 'Path to the .tar.gz file containing the Wikipedia articles in ndjson format');

const options = program.parse();

@singleton()
class WikipediaIndexer extends AsyncService {
    logger = this.globalLogger.child({ service: this.constructor.name });

    concurrency = options.opts().concurrency ? parseInt(options.opts().concurrency) : 5;

    constructor(
        protected dataLoader: DataLoader,
        protected articleEmbedder: ArticleEmbedder,
        protected globalLogger: GlobalLogger,
    ) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();

        this.emit('ready');
    }

    async processFile(fileName: string) {
        const resolved = path.resolve(fileName);
        let offset = 0;
        const progressFile = `progress-${path.basename(fileName)}.json`;
        try {
            const progressData = JSON.parse(await readFile(progressFile, 'utf-8'));
            offset = progressData.offset || 0;
            this.logger.info(`Resuming from offset ${offset}`);
        } catch (err) {
            this.logger.info(`No progress file found, starting from offset 0`);
        }
        const ndJsonStream = this.dataLoader.loadNdJsonTgz(resolved);
        const throttler = new PromiseThrottle(this.concurrency);
        let total = 0;
        let pending = 0;
        for await (const obj of ndJsonStream) {
            total += 1;
            if (total <= offset) {
                continue;
            }
            pending += 1;
            await throttler.acquire();
            this.articleEmbedder.processWikimediaArticle(obj)
                .catch((err) => {
                    this.logger.warn(`Failed to process article ${obj.url}: ${err.message}`, { err });
                })
                .finally(() => {
                    pending -= 1;
                    throttler.release();
                });
            const newOffset = total - pending;
            if (newOffset && newOffset % 10 === 0) {
                this.logger.info(`Processed ${total} articles, pending: ${pending}`);
                writeFileSync(progressFile, JSON.stringify({ offset: newOffset }, null, 2));
            }
        }
        await throttler.nextDrain();
    }

    async main() {
        await this.serviceReady();
        const files = options.args as string[];

        for (const file of files) {
            this.logger.info(`Processing file: ${file}`);
            try {
                await this.processFile(file);
                this.logger.info(`Finished processing file: ${file}`);
            } catch (err) {
                this.logger.error(`Error processing file ${file}: ${err}`, { err });
            }
        }
    }
}

const instance = container.resolve(WikipediaIndexer);

instance.main().catch(err => {
    console.error('Error in main:', err);
    process.exit(1);
}).finally(() => process.exit());