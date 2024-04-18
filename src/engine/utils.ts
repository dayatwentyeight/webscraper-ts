import { freemem, totalmem } from "os";
import { setTimeout } from "timers/promises";
import Logger from "../lib/logger";

class EngineUtils {
  private log = new Logger('EngineUtils');

  public async retryNavigate<T>(
    action: () => Promise<T>,
    retryLimit: number,
    delay: number,
  ): Promise<T> {
    let retryCnt = 0;
    while (retryCnt < retryLimit) {
      try {
        return await action();
      } catch (e) {
        if (e instanceof Error) {
          retryCnt++;
          this.log.debug(`Failed to navigate ${retryCnt} / ${retryLimit}`);
        }
      }
      await setTimeout(delay);
    }
    throw new Error('Exceed retry limit');
  }

  public setConcurrency(maxConcurrency: number, memoryEstimate: number = 128) {
    const totalMem = totalmem(); 
    const freeMem = freemem(); 

    // Calculate the amount of memory that should be considered as available,
    // leaving 20% of the total memory free.
    const reservedMemory = totalMem * 0.20;        // 20% of total memory
    const usableMemory = freeMem - reservedMemory; // Actual usable memory after reserving 20%

    const memoryEstimateBytes = memoryEstimate * 1024 * 1024;
    const numInstances = Math.floor(usableMemory / memoryEstimateBytes);

    if (maxConcurrency === 0) return numInstances;
    return Math.min(numInstances, maxConcurrency);
  }
}

export default EngineUtils;