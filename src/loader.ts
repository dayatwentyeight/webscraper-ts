import { chromium } from "@playwright/test";
import * as cheerio from "cheerio";
import { setTimeout } from "timers/promises";
import iconv from "iconv-lite";

import PlaywrightEngine, { PlaywrightRequestHandlerOptions } from "./engine/playwright-engine";
import ApiEngine, { ApiRequestHandlerOptions } from "./engine/api-engine";
import RequestQueue from "./engine/request-queue";
import RequestRouter from "./engine/request-router";
import Logger from "./lib/logger";
import { extractDatetimeString, parseAndFormatDate } from "./lib/date-parser";
import DbService from "./db/db.service";


type PageParams = {
  type: "url" | "scroll",
  start?: number,
  scale?: number,
  maxPageNumber?: number
}

type UrlParams = {
  baseUrl: string,
  [key: string]: string,
}

export interface Rule {
  id: string,
  engineType: 'api' | 'playwright',
  urlPattern: string,
  urlParams: UrlParams,
  pageParams: PageParams,
  linkSelectors: {
    linkSelector: string,
    linkAttr: string,
    interval: number,
    [key: string]: any,
  },
  docSelectors: {
    titleSelector: string,
    datetimeSelector: string,
    bodySelector: string,
    interval: number,
    [key: string]: any,
  },
}

export default class Loader {
  private log = new Logger('Loader');

  private getPageIndex(pageIdx: number, pagingParams: PageParams) {
    if (pagingParams.type !== "url") return 0;
    const { start, scale } = pagingParams;
    return scale * (pageIdx - 1) + start;
  }

  private buildLinkUrl(linkPattern: string, urlParams: UrlParams, page?: number) {
    const re = /\[(.*?)(?:,.*?)?\]/g; // [key,pattern]
    let result = linkPattern;
    let match = [];

    while ((match = re.exec(linkPattern)) !== null) {
      // match[0] contains the entire match
      const [key, pattern] = match[0]
        .replace('[', '')
        .replace(']', '')
        .split(',');

      if (page && key === 'page') {
        result = result.replace(match[0], `${page}`);
      } else if (key === 'start' || key === 'end') {
        const replaceStr = parseAndFormatDate(urlParams.start, 'yyyy-MM-dd', pattern);
        result = result.replace(match[0], replaceStr);
      } else if (key === 'keyword') {
        result = result.replace(match[0], encodeURIComponent(urlParams[key]));
      } else {
        result = result.replace(match[0], `${urlParams[key]}`);
      }
    }
    return result;
  }


  private textParser(text: string) {
    return text
      .replace(/[\u200B-\u200D\uFEFF\r\t]/g, "")
      .replace(/\s{2,}/g, " ");
  }

  public async load(rule: Rule) {
    this.log.info(`Rule: ${JSON.stringify(rule)}`);

    const {
      id,
      engineType,
      urlPattern,
      urlParams,
      pageParams,
      linkSelectors,
      docSelectors
    } = rule;

    const resultDb = new DbService('result');
    const queue = new RequestQueue(`queue-${engineType}`);
    const router = new RequestRouter();

    if (engineType === "api") {
      await router.addHandler(
        'addRequest',
        async ({ navigate, enqueue }: ApiRequestHandlerOptions) => {
          let pageNum = 1;
          while (pageNum < pageParams.maxPageNumber + 1) {
            const pageIndex = this.getPageIndex(pageNum++, pageParams);
            const url = this.buildLinkUrl(urlPattern, urlParams, pageIndex);
            this.log.info(`Go to ${url}`);

            const res = await navigate(url);
            const contentType = res.headers['content-type'];
            const requests = [];

            if (contentType.includes('text/html')) {
              const $ = cheerio.load(res.data);
              $(linkSelectors.linkSelector).map((idx, el) => {
                const url = linkSelectors.baseUrl
                  ? linkSelectors.baseUrl + $(el).attr(linkSelectors.linkAttr)
                  : linkSelectors.linkAttr;
                requests.push({
                  url,
                  label: 'docRequest'
                });
              });
            }
            // add process for json

            if (requests.length < 1) break;
            await enqueue(requests);
            await setTimeout(linkSelectors.interval);
          }
        }
      );

      await router.addHandler(
        'docRequest',
        async ({ request, navigate }: ApiRequestHandlerOptions) => {
          try {
            this.log.info(`Navigates to ${request.url}`);
            const res = await navigate(request.url, { responseType: "arraybuffer" });
            const contentType = res.headers['content-type'];
            await setTimeout(docSelectors.interval);

            const charset = /charset=(\S*)/.exec(contentType)[1];
            if (contentType.includes('text/html')) {
              const data = iconv.decode(res.data, charset).toString();
              const $ = cheerio.load(data);

              const title = $(docSelectors.titleSelector).text();
              const body = $(docSelectors.bodySelector).text();
              const dtText = docSelectors.datetimeAttr
                ? $(docSelectors.datetimeSelector).attr(docSelectors.datetimeAttr)
                : $(docSelectors.datetimeSelector).text();
              const datetime = extractDatetimeString(dtText);

              this.log.info(`Save result to /result/${id}`)
              await resultDb.insert(`/${id}`, [{
                url: request.url,
                title,
                datetime,
                body: this.textParser(body),
              }])
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('Cannot find datetime string')) {
              this.log.error(e);
            } else {
              throw e;
            }
          }
        }
      );

      return new ApiEngine({
        requestQueue: queue,
        requestHandler: router,
        maxConcurrency: 5,
        maxRetry: 3,
      });

    } else if (engineType === "playwright") {
      await router.addHandler(
        'addRequest',
        async ({ page, navigate, enqueue }: PlaywrightRequestHandlerOptions) => {
          let pageNum = 1;

          while (pageNum < pageParams.maxPageNumber + 1) {
            const pageIndex = this.getPageIndex(pageNum++, pageParams);
            const url = this.buildLinkUrl(urlPattern, urlParams, pageIndex);

            this.log.info(`Go to ${url}`);
            await navigate(url);

            const links = await page.$$eval(
              linkSelectors.linkSelector,
              (els, attr) => els.map(el => el.getAttribute(attr)),
              linkSelectors.linkAttr,
            );

            if (links.length < 1) break;
            const items = links.map((url) => ({
              url,
              label: 'docRequest'
            }))
            await enqueue(items);
            await page.waitForTimeout(linkSelectors.interval);
          }
        }
      );

      await router.addHandler(
        'docRequest',
        async ({ request, page, navigate }: PlaywrightRequestHandlerOptions) => {
          try {
            await page.route('**/*', (route) => {
              if (route.request().resourceType() === 'image') {
                // Abort requests for images
                route.abort();
              } else {
                // Continue all other requests
                route.continue();
              }
            });

            await navigate(request.url);
            await page.waitForTimeout(docSelectors.interval);

            const title = await page.$eval(docSelectors.titleSelector, (e) => e.textContent);
            const body = await page.$eval(docSelectors.bodySelector, (e) => e.textContent);
            const dtElem = await page.$(docSelectors.datetimeSelector);
            const dtText = docSelectors.datetimeAttr
              ? await dtElem.getAttribute(docSelectors.datetimeAttr)
              : await dtElem.textContent()
            const datetime = extractDatetimeString(dtText);

            this.log.info(`Save result to /result/${id}`)
            await resultDb.insert(`/${id}`, [{
              url: request.url,
              title,
              datetime,
              body: this.textParser(body),
            }])
          } catch (e) {
            if (e instanceof Error && e.message.includes('Cannot find datetime string')) {
              this.log.error(e);
            } else {
              throw e;
            }
          }
        }
      );

      return new PlaywrightEngine({
        launchContext: {
          launcher: chromium,
          lauchOptions: {
            headless: true,
          },
        },
        requestQueue: queue,
        requestHandler: router,
        maxConcurrency: 5,
        maxRetry: 3,
      });

    } else {
      throw new Error('Engine Type Not Supported');
    }
  }
}