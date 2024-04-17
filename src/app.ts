import Loader from "./loader";
import Logger from "./lib/logger";
import { getRuleList } from "./lib/fs-utils";

class App {
  private log = new Logger('App');
  private loader = new Loader();

  async main() {
    this.log.info('Start scraping');

    const rules = await getRuleList();
    if (!rules) {
      throw new Error('Cannot find rules');
    }

    for (const rule of rules) {
      // Load enigne with rule
      const engine = await this.loader.load(rule);
      await engine.run();
    }
  }
}

const app = new App();
app.main();