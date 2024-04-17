
type Action = (args: any) => Promise<void>;

export type RequestHandler = {
  key: string,
  action: Action,
  index: number,
};

class RequestRouter {
  private handlers: RequestHandler[]; 
  private index: number;

  constructor() {
    this.handlers = [];
    this.index = 0;
  }

  async addHandler<T>(key: string, action: (args: T) => Promise<void>) {
    const handler = await this.getHandler(key);
    if (handler) throw new Error(`"${key}" handler already exists.`);
    this.handlers.push({ key, action, index: this.index++ });
  }

  async getHandler(key: string) {
    const handler = this.handlers.find((v) => v.key === key);
    return handler;
  }

  async getHandlerKeys() {
    return this.handlers.map(v => v.key);
  }
}

export default RequestRouter;