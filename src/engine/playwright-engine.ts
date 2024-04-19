import { BrowserContext, BrowserType, LaunchOptions, Page, Response } from "@playwright/test";
import Logger from "../lib/logger";
import EngineUtils from "./utils";
import RequestQueue, { RequestQueueItem } from "./request-queue";
import RequestRouter, { RequestHandler } from "./request-router";

export interface LaunchContext {
  launcher: BrowserType,
  lauchOptions: LaunchOptions,
}

export interface PlaywrightRequestHandlerOptions {
  page: Page,
  request?: RequestQueueItem,
  navigate: (url: string, options?: {
    referer?: string;
    timeout?: number;
    waitUntil?: "networkidle" | "load" | "domcontentloaded" | "commit";
  }) => Promise<Response>,
  enqueue?: (item: any) => Promise<boolean | void>,
}

export interface PlaywrightEngineOptions {
  launchContext: LaunchContext;
  requestQueue: RequestQueue;
  requestHandler: RequestRouter;
  maxConcurrency?: number;
  maxRetry?: number;
}

class PlaywrightEngine {
  private log = new Logger('PlaywrightEngine');
  private launchContext: LaunchContext;
  private requestQueue: RequestQueue;
  private requestHandler: RequestRouter;
  private maxConcurrency: number;
  private maxRetry: number;
  private utils = new EngineUtils();

  constructor({
    launchContext,
    requestQueue,
    requestHandler,
    maxConcurrency = 0,
    maxRetry = 1,
  }: PlaywrightEngineOptions) {
    this.launchContext = launchContext;
    this.requestQueue = requestQueue;
    this.requestHandler = requestHandler;
    this.maxConcurrency = maxConcurrency;
    this.maxRetry = maxRetry;
  }

  async handleAction(
    context: BrowserContext,
    handler: RequestHandler,
    request?: RequestQueueItem
  ) {
    const page = await context.newPage();
    try {
      // Navigate to url with retry option;
      const navigate: PlaywrightRequestHandlerOptions["navigate"] =
        async (url, options) =>
          await this.utils.retryNavigate(
            async () => await page.goto(url, options),
            this.maxRetry,
            1000
          );

      // Push item(s) to RequestQueue
      const enqueue: PlaywrightRequestHandlerOptions["enqueue"] =
        async (item) => await this.requestQueue.push(item);

      if (request) {
        this.log.info(`Run action with ${JSON.stringify(request)}`);
      } else {
        this.log.info(`Run addRequest`);
      }

      await handler.action({ page, request, navigate, enqueue });
      
    } catch (e) {
      this.log.error(e);
    } finally {
      await page.close();
    }
  }

  public async run() {
    const handlerKeys = await this.requestHandler.getHandlerKeys();

    if (handlerKeys.length < 1) {
      throw new Error('Cannot find any handlers to run');
    }

    // Launch Browser
    const { launcher, lauchOptions } = this.launchContext;
    const browser = await launcher.launch(lauchOptions);
    const context = await browser.newContext();

    try {
      // Starts with action whose key is 'addRequest'
      // This action does not run concurrently
      const linkHandler = await this.requestHandler.getHandler('addRequest');
      await this.handleAction(context, linkHandler);

      let concurrency = this.utils.setConcurrency(this.maxConcurrency);
      let requests = await this.requestQueue.pop(concurrency);

      while (requests.length > 0) {
        const actions = [];
        for (const request of requests) {
          const handler = await this.requestHandler.getHandler(request.label);
          if (!handler) {
            throw new Error(`Cannot find handler with ${request.label}`);
          }

          actions.push(this.handleAction(context, handler, request));
        }

        // Run actions concurrently 
        this.log.info(`Process ${actions.length} requests`);
        await Promise.all(actions);

        concurrency = this.utils.setConcurrency(this.maxConcurrency);

        // Pop request items for next batch
        requests = await this.requestQueue.pop(concurrency);
      }
    } finally {
      await browser.close();
    }
  }
}

export default PlaywrightEngine;