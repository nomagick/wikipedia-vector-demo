import { AbstractPinoLogger } from 'civkit/pino-logger';
import { singleton, container } from 'tsyringe';


@singleton()
export class GlobalLogger extends AbstractPinoLogger {
    loggerOptions = {
        level: 'debug',
    };

    override init(): void {
        if (process.env['NODE_ENV']?.startsWith('prod')) {
            super.init(process.stdout);
        } else {
            const PinoPretty = require('pino-pretty').PinoPretty;
            super.init(PinoPretty({
                singleLine: true,
                colorize: true,
            }));
        }

        this.emit('ready');
    }
}

const instance = container.resolve(GlobalLogger);
instance.serviceReady();
export default instance;
