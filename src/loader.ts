import { chromium } from "@playwright/test";
import PlaywrightEngine, { RequestHandlerOptions } from "./engine/playwright-engine";
import RequestQueue from "./engine/request-queue";
import RequestRouter from "./engine/request-router";
import Logger from "./lib/logger";
import { parseAndFormatDate } from "./lib/date-parser";
import DbService from "./db/db.service";

type PageParams = {
  type: "url" | "scroll",
  start?: number,
  numberOfItems?: number,
  maxPageNumber?: number
}

type UrlParams = {
  baseUrl: string,
  [key: string]: string,
}

export interface Rule {
  id: string,
  urlPattern: string,
  urlParams: UrlParams,
  pageParams: PageParams,
  linkSelectors: {
    linkSelector: string,
    linkAttr: string,
    interval: number,
  },
  docSelectors: {
    titleSelector: string,
    datetimeSelector: string,
    datetimeAttr: string,
    bodySelector: string,
    interval: number,
  },
}

export default class Loader {
  private log = new Logger('Loader');

  private getPageIndex(pageIdx: number, pagingParams: PageParams) {
    if (pagingParams.type !== "url") return 0;
    const { start, numberOfItems } = pagingParams;
    return numberOfItems * (pageIdx - 1) + start;
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

    const { id, urlPattern, urlParams, pageParams, linkSelectors, docSelectors } = rule;

    const resultDb = new DbService('result');
    const queue = new RequestQueue();
    const router = new RequestRouter();

    await router.addHandler(
      'addRequest',
      async ({ page, navigate, enqueue }: RequestHandlerOptions) => {
        let pageNum = 1;

        while (pageNum < pageParams.maxPageNumber + 1) {
          const pageIndex = this.getPageIndex(pageNum++, pageParams);
          const url = this.buildLinkUrl(urlPattern, urlParams, pageIndex);
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
      async ({ request, page, navigate }: RequestHandlerOptions) => {
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
        const datetime = await dtElem.getAttribute(docSelectors.datetimeAttr);

        this.log.info(`Save result to /result/${id}`)
        await resultDb.insert(`/${id}`, [{
          url: request.url,
          title,
          datetime,
          body: this.textParser(body),
        }])
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
      maxConcurrency: 3,
      maxRetry: 3,
    });
  }
}