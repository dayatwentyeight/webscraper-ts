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
} 

export default EngineUtils;