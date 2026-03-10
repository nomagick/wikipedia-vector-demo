import { PassThrough, Transform, TransformOptions } from 'node:stream';
import { AsyncService } from 'civkit/async-service';
import { createGunzip } from 'zlib';
import { TransformCallback } from 'stream';
import globalLogger, { GlobalLogger } from './logger';
import { createReadStream } from 'node:fs';
import { extract } from 'tar-stream';
import { singleton } from 'tsyringe';

@singleton()
export class DataLoader extends AsyncService {

    logger = this.globalLogger.child({ service: this.constructor.name });

    constructor(protected globalLogger: GlobalLogger) {
        super(...arguments);
    }

    override async init() {
        await this.dependencyReady();
        this.emit('ready');
    }

    loadNdJsonTgz(filePath: string) {
        const tarStream = extract();

        const fileStream = createReadStream(filePath);
        const ungzStream = createGunzip();

        fileStream.pipe(ungzStream)
            .pipe(tarStream);

        // tarStream.on('error', (err) => {
        //     this.logger.error(`Error reading file ${filePath}`, err);
        // });
        const passThrough = new PassThrough({ objectMode: true });

        tarStream.on('entry', async (header, stream, next) => {
            const ndJsonStream = new NdJsonStream();
            this.logger.debug(`Processing entry: ${header.name} (${header.type})`);
            // stream.resume();
            ndJsonStream.once('end', () => {
                this.logger.debug(`Finished processing entry: ${header.name}, ${ndJsonStream._ln} lines processed`);

                next();
            });
            stream.pipe(ndJsonStream);
            ndJsonStream.pipe(passThrough, { end: false });
            // ndJsonStream.on('data', (obj) => {
            //     // this.logger.debug(`Parsed object from ${header.name}: ${ndJsonStream._ln}`);
            //     // Process the parsed object as needed
            // });
        });

        tarStream.once('finish', () => {
            passThrough.push(null);
        });

        return passThrough;
    }

}

export class NdJsonStream extends Transform {

    _ln = 0;
    lastLine: string | undefined = undefined;
    textDecoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

    constructor(
        opts?: TransformOptions
    ) {
        super({ ...opts, readableObjectMode: true });
    }

    override _transform(buff: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
        const chunk = this.textDecoder.decode(buff, { stream: true });
        const lines = chunk.split('\n');
        const lastLine = lines.pop();
        if (!lines.length) {
            this.lastLine = `${this.lastLine || ''}${lastLine}`;
            callback();
            return;
        }
        if (this.lastLine) {
            const combinedLine = `${this.lastLine || ''}${lines.shift()}`;
            lines.unshift(combinedLine);
        }
        this.lastLine = lastLine;
        for (const line of lines) {
            if (line.trim() === '') continue;
            this._ln++;
            try {
                const obj = JSON.parse(line);
                this.push(obj);
            } catch (err) {
                globalLogger.warn(`Failed to parse line ${this._ln} as JSON: ${line}`, err);
                continue;
            }
        }
        callback();
    }

    override _final(callback: TransformCallback): void {
        this.lastLine = `${this.lastLine || ''}${this.textDecoder.decode(new ArrayBuffer(), { stream: false })}`;

        if (this.lastLine) {
            this._ln++;
            try {
                const obj = JSON.parse(this.lastLine);
                this.push(obj);
            } catch (err) {
                globalLogger.warn(`Failed to parse line ${this._ln} as JSON: ${this.lastLine}`, err);
            }
        }
        callback();
    }
}