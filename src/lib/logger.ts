import * as winston from 'winston';
import path from 'path';
import fs from 'fs';

const packageName = 'webscraper';
const logDir = path.join(process.env.PWD, 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const format = winston.format.printf(({ level, message, label, timestamp }) => {
  // Pad the level to a fixed width of 16 characters
  const paddedLevel = level.padStart(16);
  return `${timestamp} ${paddedLevel} [${label}] ${message}`;
});

class Logger {
  private label: string;
  private logger: winston.Logger;
  
  constructor(label: string) {
    this.label = label;
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
        winston.format.colorize(),
        format
      ),
      defaultMeta: { service: packageName },
      transports: [
        // Write all logs with level `error` and below
        new winston.transports.File({ filename: path.join(logDir, `${packageName}.error.log`), level: 'error' }),
        // Write all logs with level `debug` and below
        new winston.transports.File({ filename: path.join(logDir, `${packageName}.log`) }),
        // Console logs
        new winston.transports.Console(),
      ],
    });
  }

  public info(message: any) {
    const msg = typeof message === "object" ? JSON.stringify(message) : message;
    this.logger.info(msg, { label: this.label });
  }

  public debug(message: string) {
    const msg = typeof message === "object" ? JSON.stringify(message) : message;
    this.logger.debug(msg, { label: this.label });
  }

  public warn(message: string) {
    const msg = typeof message === "object" ? JSON.stringify(message) : message;
    this.logger.warn(msg, { label: this.label });
  }

  public error(error: unknown) {
    if (error instanceof Error) {
      this.logger.error(error.message, { error, label: this.label});
    } else {
      this.logger.error(JSON.stringify(error), { label: this.label });
    }
  }
}

export default Logger;
