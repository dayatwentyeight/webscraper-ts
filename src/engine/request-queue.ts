import DbService from "../db/db.service";

export interface RequestQueueItem {
  url: string;
  label: string;
  [key: string]: any;
}

class RequestQueue {
  private db: DbService;
  private requestTable: string; 

  constructor() {
    this.db = new DbService('queue');
    this.requestTable = 'request'; 
   }

  async push(
    data: RequestQueueItem | RequestQueueItem[], 
    allowDuplicate: boolean = false
  ) {    
    const list = await this.db.getList(`/${this.requestTable}`) as RequestQueueItem[];
    const insertData = Array.isArray(data) ? data : [data];
    
    if (list.length < 1 || allowDuplicate) {
      await this.db.insert(`/${this.requestTable}`, insertData);
      return true; // Succesfully done
    }

    // list.length >= 1 && !allowDuplicate
    for (const item of insertData) {
      // If queue has an item with the same url
      const isDuplicatedUrl = list.some(({ url }) => url === item.url);
      if (!isDuplicatedUrl) {
        await this.db.insert(`/${this.requestTable}`, [item]); 
      }
    }
    return true;
  }

  async pop(concurrency: number = 1): Promise<RequestQueueItem[]> {
    const items: RequestQueueItem[] = await this.db.getList(`/${this.requestTable}`);
    const itemsToPop = items.slice(0, concurrency);
    const itemsToRemain = items.slice(concurrency);

    // Update the list in the json db
    await this.db.insert(`/${this.requestTable}`, itemsToRemain, true);
    return itemsToPop
  }

}

export default RequestQueue;