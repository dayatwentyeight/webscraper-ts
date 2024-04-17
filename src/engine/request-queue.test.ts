import RequestQueue from './request-queue';
import DbService from '../db/db.service';

jest.mock("../db/db.service", () => {
  const mockModule = { getList: jest.fn(), insert: jest.fn() };
  return jest.fn(() => mockModule);
});

describe('RequestQueue', () => {
  let queue: RequestQueue;
  let mockDbService: jest.Mocked<DbService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    mockDbService = new DbService('queue') as jest.Mocked<DbService>;
    queue = new RequestQueue();
  });

  describe('push()', () => {
    it('should add items to the database when empty', async () => {
      // Simulate empty database
      mockDbService.getList.mockResolvedValue([]);
      const item = { url: 'http://example.com', label: 'test' };
      const result = await queue.push(item);
      expect(result).toBe(true);
      expect(mockDbService.getList).toHaveBeenCalledTimes(1);
      expect(mockDbService.insert).toHaveBeenCalledWith('/request', [item]);
    });

    it('should add duplicate items if allowed', async () => {
      const item = { url: 'http://example.com', label: 'test' };

      // Simulate item already exists
      mockDbService.getList.mockResolvedValue([item]); 
      const result = await queue.push(item, true);
      expect(result).toBe(true);
      expect(mockDbService.insert).toHaveBeenCalledWith('/request', [item]);
    });

    it('should not add duplicate items if not allowed', async () => {
      const item = { url: 'http://example.com', label: 'test' };

      // Simulate item already exists
      mockDbService.getList.mockResolvedValue([item]); 
      const result = await queue.push(item);
      expect(result).toBe(true);
      expect(mockDbService.insert).not.toHaveBeenCalled();
    });
  });

  describe('pop()', () => {
    it('should update the database after removing items', async () => {
      const items = [{ url: 'http://example.com', label: 'test' }];

      // Simulate item already exists
      mockDbService.getList.mockResolvedValue(items);
      const result = await queue.pop(1);
      expect(result).toEqual(items);
      expect(mockDbService.insert).toHaveBeenCalledWith('/request', [], true);
    });
  });
});
