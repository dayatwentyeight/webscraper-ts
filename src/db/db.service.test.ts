import { JsonDB, DataError } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import DbService from './db.service';
import Logger from '../lib/logger';

jest.mock("../lib/logger", () => {
  const mockModule = { error: jest.fn() };
  return jest.fn(() => mockModule);
});

jest.mock('node-json-db', () => {
  const mJsonDB = {
    getData: jest.fn(),
    push: jest.fn()
  };

  // Mocking DataError by creating an error and adding an 'id' property
  class MockDataError extends Error {
    id: number;
    constructor(message: string, id: number) {
      super(message); // Call to the Error constructor
      Object.setPrototypeOf(this, MockDataError.prototype); // Set the prototype explicitly
      this.name = 'DataError'; // Set the error name
      this.id = id; // Additional properties specific to DataError
    }
  }
  return {
    JsonDB: jest.fn(() => mJsonDB),
    DataError: MockDataError
  };
});

jest.mock('node-json-db/dist/lib/JsonDBConfig', () => ({
  Config: jest.fn()
}));

describe('DbService', () => {
  let dbService: DbService;
  const mockJsonDB = new JsonDB(
    new Config(`testdb`, true, false, '/')
  ) as jest.Mocked<JsonDB>;
  const mockLogger = new Logger('DbService') as jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    dbService = new DbService('testdb');
  });

  describe('insert()', () => {
    it('should add data to the database', async () => {
      const path = '/test';
      const data = { key: 'value' };
      await dbService.insert(path, data);
      expect(mockJsonDB.push).toHaveBeenCalledWith(path, data, false);
    });

    it('should overwrite data in the database when override is true', async () => {
      const path = '/test';
      const data = { key: 'value' };
      await dbService.insert(path, data, true);
      expect(mockJsonDB.push).toHaveBeenCalledWith(path, data, true);
    });
  });

  describe('getList()', () => {
    it('should return data if path exists', async () => {
      const path = '/test';
      const expectedData = [{ key: 'value' }];
      mockJsonDB.getData.mockResolvedValue(expectedData);
      const result = await dbService.getList(path);
      expect(result).toEqual(expectedData);
    });

    it('should return empty array if path does not exist', async () => {
      const path = '/test';

      // Mocking data error with id 5
      const error = new DataError('Path not exist', 5);
      mockJsonDB.getData.mockRejectedValue(error);
      const result = await dbService.getList(path);
      expect(mockJsonDB.push).toHaveBeenCalledWith(path, [], true);
      expect(result).toEqual([]);
    });

    it('should log and rethrow if error id is not 5', async () => {
      const path = '/test';
      const error = new Error('Unexpected error');
      mockJsonDB.getData.mockRejectedValue(error);
      await expect(dbService.getList(path)).rejects.toThrow('Unexpected error');
      expect(mockLogger.error).toHaveBeenCalledWith(error);
    });
  });
});
