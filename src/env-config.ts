import { container, singleton } from 'tsyringe';

export const SPECIAL_COMBINED_ENV_KEY = 'SECRETS_COMBINED';
const CONF_ENV = [
    'JINA_READER_API_URL',
    'JINA_API_KEY',
    'ELASTICSEARCH_URL',
    'ELASTICSEARCH_API_KEY',
] as const;

['.env', '.secret.local'].forEach((x)=> {
    try {
        process.loadEnvFile('.secret.local');
    } catch (err) {
        void 0;
    }
});

@singleton()
export class EnvConfig {
    dynamic!: Record<string, string>;

    combined: Record<string, string> = {};
    originalEnv: Record<string, string | undefined> = { ...process.env };

    constructor() {
        if (process.env[SPECIAL_COMBINED_ENV_KEY]) {
            Object.assign(this.combined, JSON.parse(
                Buffer.from(process.env[SPECIAL_COMBINED_ENV_KEY]!, 'base64').toString('utf-8')
            ));
            delete process.env[SPECIAL_COMBINED_ENV_KEY];
        }

        // Static config
        for (const x of CONF_ENV) {
            const s = process.env[x] || this.combined[x] || '';
            Reflect.set(this, x, s);
            if (x in process.env) {
                delete process.env[x];
            }
        }

        // Dynamic config
        this.dynamic = new Proxy({
            get: (_target: any, prop: string) => {
                return this.combined[prop] || process.env[prop] || '';
            }
        }, {}) as any;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EnvConfig extends Record<typeof CONF_ENV[number], string> { }

const instance = container.resolve(EnvConfig);
export default instance;