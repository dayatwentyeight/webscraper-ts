import { JsonDB, DataError } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import Logger from '../lib/logger';

class DbService {
  private db: JsonDB;
  private log = new Logger('DbService');

  constructor(dbpath: string) {
    this.db = new JsonDB(new Config(`data/${dbpath}`, true, false, '/'));
  }

  async insert<T>(path: string, value: T, override: boolean = false) {
    this.db.push(path, value, override);
  }

  async getList<T>(path: string): Promise<T[]> {
    try {
      const list = await this.db.getData(path);
      return list;
    } catch (e) {
      if (e instanceof DataError && e.id === 5) {
        // If the path not exist, Push as a new array
        await this.db.push(path, [], true);
        return [];
      } else {
        this.log.error(e);
        throw e;
      }
    }
  }
}

export default DbService;