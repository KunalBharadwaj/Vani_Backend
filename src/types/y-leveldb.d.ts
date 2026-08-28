// Minimal ambient declaration for y-leveldb (ships no types), covering the
// subset of the API this project uses.
declare module "y-leveldb" {
  import type * as Y from "yjs";

  export class LeveldbPersistence {
    constructor(location: string);
    getYDoc(docName: string): Promise<Y.Doc>;
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    clearDocument(docName: string): Promise<void>;
  }
}
