import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { setTimeout } from "timers/promises";

import Logger from "../lib/logger";
import RequestQueue, { RequestQueueItem } from "./request-queue";
import RequestRouter, { RequestHandler } from "./request-router";
import EngineUtils from "./utils";

export interface ApiRequestHandlerOptions {
  response?: AxiosResponse,
  request?: RequestQueueItem,
  navigate: (url: string, options?: AxiosRequestConfig) => Promise<AxiosResponse>,
  enqueue?: (item: any) => Promise<boolean | void>,
}

class ApiEngine {
  private log = new Logger('ApiEngine');
  private requestQueue: RequestQueue;
  private requestHandler: RequestRouter;
  private maxConcurrency: number;
  private maxRetry: number;
  private utils = new EngineUtils();

  constructor({
    requestQueue,
    requestHandler,
    maxConcurrency = 0,
    maxRetry = 1,
  }) {
    this.requestQueue = requestQueue;
    this.requestHandler = requestHandler;
    this.maxConcurrency = maxConcurrency;
    this.maxRetry = maxRetry;
  }

  async handleAction(
    handler: RequestHandler,
    request?: RequestQueueItem
  ) {
    try {
      // Navigate to url with retry option;
      const navigate = async (url: string, options?: AxiosRequestConfig) =>
        await this.utils.retryNavigate(
          async () => await axios.get(url, options),
          this.maxRetry,
          1000
        );

      // Push item(s) to RequestQueue
      const enqueue: ApiRequestHandlerOptions["enqueue"] =
        async (item) => await this.requestQueue.push(item);

      await handler.action({ request, navigate, enqueue });
    } catch (e) {
      this.log.error(e);
    }

  }

  public async run() {
    const handlerKeys = await this.requestHandler.getHandlerKeys();
    if (handlerKeys.length < 1) {
      throw new Error('Cannot find any handlers to run');
    }

    // Starts with action whose key is 'addRequest'
    // This action does not run concurrently
    const linkHandler = await this.requestHandler.getHandler('addRequest');
    await this.handleAction(linkHandler);

    while (true) {
      try {
        const actions = [];
        let concurrency = this.utils.setConcurrency(this.maxConcurrency, 32);
        let requests = await this.requestQueue.pop(concurrency);

        if (requests.length < 1) break;

        for (const request of requests) {
          const handler = await this.requestHandler.getHandler(request.label);
          if (!handler) {
            throw new Error(`Cannot find handler with ${request.label}`);
          }

          actions.push(this.handleAction(handler, request));
        }

        // Run actions concurrently 
        this.log.info(`Process ${actions.length} requests`);
        await Promise.all(actions);

        // Set concurrency for next batch
        concurrency = this.utils.setConcurrency(this.maxConcurrency, 32);

        // Pop request items for next batch
        requests = await this.requestQueue.pop(concurrency);
      } catch (e) {
        if (e instanceof Error && e.message === "Not enough memory to run engines") {
          const timeout = 30000;
          this.log.debug(`Sleep for ${timeout}ms`);
          await setTimeout(timeout);
        } else {
          throw e;
        }
      }
    }
  }
}

export default ApiEngine;