import axios, { AxiosStatic } from "axios";
import { setTimeout } from "timers/promises";

import Logger from "../lib/logger";
import EngineUtils from "./utils";
import RequestQueue from "./request-queue";
import RequestRouter, { RequestHandler } from "./request-router";
import ApiEngine from "./api-engine";


jest.mock("axios");
jest.mock("timers/promises");
jest.mock("../lib/logger", () => {
  const mLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
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

describe('ApiEngine', () => {
  const mockLogger = new Logger('ApiEngine') as jest.Mocked<Logger>;
  let engine: ApiEngine;
  let mockAxios: jest.Mocked<AxiosStatic>;
  let mockRequestQueue: jest.Mocked<RequestQueue>;
  let mockRequestRouter: jest.Mocked<RequestRouter>;
  let mockEngineUtils: jest.Mocked<EngineUtils>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    mockAxios = axios as jest.Mocked<AxiosStatic>;
    mockRequestQueue = new RequestQueue('queue') as jest.Mocked<RequestQueue>;
    mockRequestRouter = new RequestRouter() as jest.Mocked<RequestRouter>;
    mockEngineUtils = new EngineUtils() as jest.Mocked<EngineUtils>;
    engine = new ApiEngine({
      requestQueue: mockRequestQueue,
      requestHandler: mockRequestRouter,
      maxConcurrency: 3,
      maxRetry: 1,
    });
  });

  describe('handleAction()', () => {
    it('should call action with the correct parameters', async () => {
      const handler = {
        key: 'testAction',
        action: jest.fn().mockResolvedValue({}),
        index: 0,
      } as RequestHandler;
      const requestItem = { url: 'http://example.com', label: 'test' };
      await engine.handleAction(handler, requestItem);

      expect(handler.action).toHaveBeenCalledWith(expect.objectContaining({
        request: requestItem,
        navigate: expect.any(Function),
        enqueue: expect.any(Function)
      }));
    });

    it('should navigate and enqueue items using the provided functions in action', async () => {
      const handler = {
        key: 'addRequest',
        index: 0,
        action: jest.fn().mockImplementation(async ({ navigate, enqueue }) => {
          await navigate('http://example.com');
          await enqueue({ url: 'http://example.com', label: 'enqueueTest' });
        })
      };

      // Simulate axios.get action
      mockAxios.get.mockResolvedValue({});

      mockEngineUtils.retryNavigate.mockImplementation(
        async (action: () => Promise<unknown>, retryLimit: number, delay: number) => {
          // page.goto will be executed in retryNavigate 
          await mockAxios.get("http://example.com");
        });

      await engine.handleAction(handler);

      expect(mockEngineUtils.retryNavigate).toHaveBeenCalled();
      expect(mockAxios.get).toHaveBeenCalledWith('http://example.com');
      expect(mockRequestQueue.push).toHaveBeenCalledWith({ url: 'http://example.com', label: 'enqueueTest' });
    });

    it('should log error', async () => {
      const error = new Error('Unexpected error');
      const handler = {
        key: 'testAction',
        action: jest.fn().mockRejectedValue(error),
        index: 0,
      } as RequestHandler;

      await engine.handleAction(handler);

      // Verify that the error is logged
      expect(mockLogger.error).toHaveBeenCalledWith(error);
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
      mockRequestRouter.getHandlerKeys.mockResolvedValue(['addRequest', 'nextRequest']);
      mockRequestRouter.getHandler.mockImplementation((key) => {
        return Promise.resolve(handlers.find(handler => handler.key === key));
      });

      // Simulate that each handler leads to some items being processed
      mockRequestQueue.pop
        .mockResolvedValueOnce(requests)
        .mockResolvedValueOnce([]); // Simulate that the queue is empty after the first batch

      await engine.run();

      // Check if the pop is called 3 times, once for each handler
      expect(mockRequestQueue.pop).toHaveBeenCalledTimes(1 + requests.length);

      // Check if the getHandler is called 3 times, once for each handler
      expect(mockRequestRouter.getHandler).toHaveBeenCalledTimes(1 + requests.length);

      // Ensure addRequest handler's action is called once
      expect(handlers[0].action).toHaveBeenCalledTimes(1);

      // Ensure nextRequest handler's action is called as many as the queue length
      expect(handlers[1].action).toHaveBeenCalledTimes(requests.length);
    });

    it('should throw Error when no handlers matching with the label of the queue item', async () => {
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

    it('should sleep for 30000ms and try again if "Not enough memory to run engines"', async () => {
      // Simulate "Not enough memory to run engines" error on setConcurrency
      mockEngineUtils.setConcurrency.mockImplementationOnce(() => {
        throw new Error("Not enough memory to run engines")
      });

      await engine.run();

      expect(mockLogger.debug).toHaveBeenCalledWith('Sleep for 30000ms');
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenCalledWith(30000);
    });

  });
});