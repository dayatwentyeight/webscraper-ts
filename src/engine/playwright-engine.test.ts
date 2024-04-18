import PlaywrightEngine from './playwright-engine';
import { BrowserType, LaunchOptions, BrowserContext, chromium } from "@playwright/test";
import Logger from "../lib/logger";
import EngineUtils from "./utils";
import RequestQueue from "./request-queue";
import RequestRouter, { RequestHandler } from "./request-router";

jest.mock("@playwright/test", () => {
  const mockPage = {
    goto: jest.fn().mockImplementation(async (url: string, options: {
      referer?: string,
      timeout?: number,
      waitUntil?: "networkidle" | "load" | "domcontentloaded" | "commit",
    }) => Promise.resolve(Response)),
    close: jest.fn(),
  };
  const mockBrowserContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
  };
  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockBrowserContext),
    close: jest.fn(),
  };

  return ({
    // Mock BrowserType to use in tests
    chromium: {
      launch: jest.fn().mockResolvedValue(mockBrowser)
    },
    LaunchOptions: jest.fn(),
    BrowserContext: jest.fn(() => mockBrowserContext),
    Page: jest.fn(() => mockPage),
    Response: jest.fn(),
  })
});
jest.mock("../lib/logger", () => {
  const mLogger = {
    info: jest.fn(),
    error: jest.fn(),
  }
  return jest.fn(() => mLogger);
});
jest.mock("./utils", () => {
  const mUtils = {
    retryNavigate: jest.fn(),
    setConcurrency: jest.fn(),
  }
  return jest.fn(() => mUtils);
});
jest.mock("./request-queue", () => {
  const mQueue = {
    push: jest.fn().mockResolvedValue(true),
    pop: jest.fn().mockResolvedValue([]),
  };
  return jest.fn(() => mQueue);
});
jest.mock("./request-router", () => {
  const mRouter = {
    getHandlerKeys: jest.fn().mockResolvedValue([]),
    getHandler: jest.fn().mockResolvedValue(
      { action: jest.fn().mockResolvedValue({}) }
    ),
  }
  return jest.fn(() => mRouter);
});

describe('PlaywrightEngine', () => {
  let engine: PlaywrightEngine;
  let mockBrowserType: jest.Mocked<BrowserType>;
  let mockRequestQueue: jest.Mocked<RequestQueue>;
  let mockRequestRouter: jest.Mocked<RequestRouter>;
  let mockBrowserContext: jest.Mocked<BrowserContext>;
  let mockEngineUtils: jest.Mocked<EngineUtils>;
  const mockLogger = new Logger('PlaywrightEngine') as jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    mockBrowserType = chromium as jest.Mocked<BrowserType>; // Use chrominum to test
    mockRequestQueue = new RequestQueue() as jest.Mocked<RequestQueue>;
    mockRequestRouter = new RequestRouter() as jest.Mocked<RequestRouter>;
    mockBrowserContext = {
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn().mockResolvedValue({}),
        close: jest.fn()
      })
    } as unknown as jest.Mocked<BrowserContext>;
    mockEngineUtils = new EngineUtils() as jest.Mocked<EngineUtils>;
    engine = new PlaywrightEngine({
      launchContext: { launcher: mockBrowserType, lauchOptions: {} as LaunchOptions },
      requestQueue: mockRequestQueue,
      requestHandler: mockRequestRouter,
      maxConcurrency: 3,
      maxRetry: 1,
    });
  });

  describe('handleAction()', () => {
    it('should process an action correctly', async () => {
      const handler = {
        key: 'testAction',
        action: jest.fn().mockResolvedValue({}),
        index: 0,
      } as RequestHandler;
      const page = await mockBrowserContext.newPage();
      await engine.handleAction(mockBrowserContext, handler);
      expect(handler.action).toHaveBeenCalled();
      expect(page.close).toHaveBeenCalled();
    });

    it('should navigate and enqueue items using the provided functions in action', async () => {
      const handler = {
        key: 'addRequest',
        index: 0,
        action: jest.fn().mockImplementation(async ({ navigate, enqueue }) => {
          await navigate('http://example.com', { timeout: 5000 });
          await enqueue({ url: 'http://example.com', label: 'enqueueTest' });
        })
      };

      // Simulate page.goto action
      const mockPage = await mockBrowserContext.newPage();
      mockEngineUtils.retryNavigate.mockImplementation(
        async (action: () => Promise<unknown>, retryLimit: number, delay: number) => {
          // page.goto will be executed in retryNavigate 
          await mockPage.goto('http://example.com', { timeout: 5000 });
      });

      await engine.handleAction(mockBrowserContext, handler);

      expect(mockBrowserContext.newPage).toHaveBeenCalled();
      expect(mockEngineUtils.retryNavigate).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', { timeout: 5000 });
      expect(mockRequestQueue.push).toHaveBeenCalledWith({ url: 'http://example.com', label: 'enqueueTest' });
    });

    // This should be updated later (export log to error logging system)
    it('should log error', async () => {
      const error = new Error('Unexpected error');
      const handler = {
        key: 'testAction',
        action: jest.fn().mockRejectedValue(error),
        index: 0,
      } as RequestHandler;
      
      const page = await mockBrowserContext.newPage();
      await engine.handleAction(mockBrowserContext, handler);

      // Verify that the error is logged
      expect(mockLogger.error).toHaveBeenCalledWith(error);

      // Verify that the page is still closed
      expect(page.close).toHaveBeenCalled(); 
    }); 
  });

  describe('run()', () => {
    it('should throw Error when no handlers available', async () => {
      mockRequestRouter.getHandlerKeys.mockResolvedValue([]);
      await expect(engine.run()).rejects.toThrow('Cannot find any handlers to run');
    });

    it(`should process 'addRequest' handler correctly`, async () => {
      const addRequestHandler = {
        key: 'addRequest',
        action: jest.fn().mockResolvedValue({}),
        index: 0,
      } as unknown as RequestHandler;

      mockRequestRouter.getHandlerKeys.mockResolvedValue(['addRequest']);
      mockRequestRouter.getHandler.mockResolvedValueOnce(addRequestHandler);

      await engine.run();
      expect(mockRequestQueue.pop).toHaveBeenCalledTimes(1);
      expect(mockRequestRouter.getHandler).toHaveBeenCalledTimes(1);
    });

    it('should process multiple handlers correctly', async () => {
      const handlers = [
        { key: 'addRequest', action: jest.fn().mockResolvedValue({}), index: 0 },
        { key: 'nextRequest', action: jest.fn().mockResolvedValue({}), index: 1 }
      ];
      const requests = [
        { label: 'nextRequest', url: 'www.example.com/1' },
        { label: 'nextRequest', url: 'www.example.com/2' }
      ];

      // Set the mock to return these handlers when getHandlerKeys and getHandler are called
      mockRequestRouter.getHandlerKeys.mockResolvedValue(handlers.map(handler => handler.key));
      mockRequestRouter.getHandler.mockImplementation((key) => {
        return Promise.resolve(handlers.find(handler => handler.key === key));
      });

      // Simulate that each handler leads to some items being processed
      mockRequestQueue.pop
        .mockResolvedValueOnce(requests)
        .mockResolvedValueOnce([]); // Simulate that the queue is empty after the first batch

      await engine.run();

      // Check if the pop is called twice, one for the first time, then one after batch
      expect(mockRequestQueue.pop).toHaveBeenCalledTimes(2);

      // Check if the getHandler is called 3 times, once for each handler
      expect(mockRequestRouter.getHandler).toHaveBeenCalledTimes(1 + requests.length);

      // Ensure addRequest handler's action is called once
      expect(handlers[0].action).toHaveBeenCalledTimes(1);

      // Ensure nextRequest handler's action is called as many as the queue length
      expect(handlers[1].action).toHaveBeenCalledTimes(requests.length);
    });

    it('should throw Erro when no handlers mathcing with the label of the queue item', async () => {
      const handlers = [
        { key: 'addRequest', action: jest.fn().mockResolvedValue({}), index: 0 },
        { key: 'nextRequest', action: jest.fn().mockResolvedValue({}), index: 1 }
      ];
      const requests = [
        { label: 'noRequest', url: 'www.example.com/1' },
      ];

      // Set the mock to return these handlers when getHandlerKeys and getHandler are called
      mockRequestRouter.getHandlerKeys.mockResolvedValue(handlers.map(handler => handler.key));
      mockRequestRouter.getHandler.mockImplementation((key) => {
        return Promise.resolve(handlers.find(handler => handler.key === key));
      });

      mockRequestQueue.pop.mockResolvedValueOnce(requests);

      await expect(engine.run()).rejects.toThrow('Cannot find handler with noRequest');
    });

  });
});

