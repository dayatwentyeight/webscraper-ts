import RequestRouter from './request-router';

describe('RequestRouter', () => {
  let router: RequestRouter;

  beforeEach(() => {
    router = new RequestRouter();
  });

  it('should add a handler successfully', async () => {
    const key = 'test';
    const action = async (args: any) => { /* mock action */ };
    await router.addHandler(key, action);
    expect(await router.getHandler(key)).toBeDefined();
  });

  it('should throw an error when adding a handler with a duplicate key', async () => {
    const key = 'duplicateKey';
    const action = async (args: any) => { /* mock action */ };
    await router.addHandler(key, action);
    await expect(router.addHandler(key, action)).rejects.toThrow(`"${key}" handler already exists.`);
  });

  it('should retrieve a handler by key', async () => {
    const key = 'getKey';
    const action = async (args: any) => { /* mock action */ };
    await router.addHandler(key, action);
    const handler = await router.getHandler(key);
    expect(handler).toBeDefined();
    expect(handler?.key).toEqual(key);
  });

  it('should list all handler keys', async () => {
    const actions = [
      { key: 'key1', action: async (args: any) => { /* mock action */ } },
      { key: 'key2', action: async (args: any) => { /* mock action */ } },
    ];
    for (const { key, action } of actions) {
      await router.addHandler(key, action);
    }
    const keys = await router.getHandlerKeys();
    expect(keys).toEqual(expect.arrayContaining(['key1', 'key2']));
  });
});
