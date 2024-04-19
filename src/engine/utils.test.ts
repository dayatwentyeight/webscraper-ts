import EngineUtils from "./utils";
import { setTimeout } from "timers/promises";
import os from "os";
import Logger from "../lib/logger";

jest.mock("../lib/logger", () => {
  const mockModule = { debug: jest.fn() };
  return jest.fn(() => mockModule);
});

jest.mock("timers/promises", () => ({
  setTimeout: jest.fn().mockResolvedValue(null),
}));


describe('EngineUtils', () => {
  let utils: EngineUtils;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    mockLogger = new Logger('EngineUtils') as jest.Mocked<Logger>;
    utils = new EngineUtils();
  });

  describe('retryNavigate()', () => {
    it('should successfully execute action without retrying', async () => {
      const action = jest.fn().mockResolvedValue("Success");
      const result = await utils.retryNavigate(action, 3, 1000);
      expect(result).toBe("Success");
      expect(action).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should retry the action after failure and succeed', async () => {
      const action = jest.fn()
        .mockRejectedValueOnce(new Error("Some Navigation Error"))
        .mockResolvedValue("Success");
      const result = await utils.retryNavigate(action, 3, 1000);
      expect(result).toBe("Success");
      expect(action).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(1000);
      expect(mockLogger.debug).toHaveBeenCalledWith("Failed to navigate 1 / 3");
    });

    it('should fail after exceeding retry limit', async () => {
      const action = jest.fn().mockRejectedValue(new Error("Some Navigation Error"));
      await expect(utils.retryNavigate(action, 2, 1000)).rejects.toThrow("Exceed retry limit");
      expect(action).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should log each retry attempt', async () => {
      const action = jest.fn()
        .mockRejectedValueOnce(new Error("Some Navigation Error"))
        .mockRejectedValueOnce(new Error("Some Navigation Error"))
        .mockResolvedValue("Finally Success");
      await utils.retryNavigate(action, 3, 1000);
      expect(mockLogger.debug).toHaveBeenCalledWith("Failed to navigate 1 / 3");
      expect(mockLogger.debug).toHaveBeenCalledWith("Failed to navigate 2 / 3");
      expect(action).toHaveBeenCalledTimes(3);
    });
  });

  describe('setConcurrency()', () => {
    it('returns number of instances based on maxConcurrency if lower than calculated instances', () => {
      jest.spyOn(os, 'totalmem').mockReturnValue(10 * 1024 * 1024 * 1024); // 10GB
      jest.spyOn(os, 'freemem').mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
      
      // totalmem = 10 GB, freemem = 8 GB, 20% reserved = 2 GB, usable = 6 GB
      // 128 MB per instance -> 48 instances
      expect(utils.setConcurrency(5)).toBe(5);
    });

    it('returns calculated number of instances if maxConcurrency is 0', () => {
      jest.spyOn(os, 'totalmem').mockReturnValue(10 * 1024 * 1024 * 1024); // 10GB
      jest.spyOn(os, 'freemem').mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB

      expect(utils.setConcurrency(0)).toBe(48);
    });

    it('should throw "Not enough memory to run engines" error if free memory is less than 20% of total memory', () => {
      jest.spyOn(os, 'totalmem').mockReturnValue(10 * 1024 * 1024 * 1024); // 10GB
      jest.spyOn(os, 'freemem').mockReturnValue(1 * 1024 * 1024 * 1024); // 1GB

      // totalmem = 10 GB, freemem = 1 GB, 20% reserved = 2 GB, usable = -1 GB
      expect(() => utils.setConcurrency(0)).toThrow("Not enough memory to run engines");
    })
  });

});
