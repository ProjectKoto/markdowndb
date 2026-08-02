import { Knex } from "knex";
export declare function resetDatabaseTables(db: Knex): Promise<void>;
export declare function mapFileToInsert(file: any, updateTime: number): any;
export declare function mapFileTagsToInsert(file: any): {
    file: any;
    tag: string;
    is_referenced: boolean;
    is_declared: boolean;
}[];
export declare function getUniqueValues<T>(inputArray: T[]): T[];
export declare function getUniqueProperties(objects: any[]): string[];
export declare function intoBatches<T>(batchSize: number, origList: T[]): T[][];
export declare function runByBatch<T, U>(batchSize: number, origList: T[], batchConverter: (a: T[]) => Promise<U[]>): Promise<U[]>;
export declare function asyncGenIntoBatches<T>(batchSize: number, iterable: AsyncIterableIterator<T>): AsyncGenerator<T[], void, unknown>;
