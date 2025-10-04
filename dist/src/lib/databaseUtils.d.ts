import { Knex } from "knex";
import { File } from "./schema.js";
export declare function resetDatabaseTables(db: Knex): Promise<void>;
export declare function mapFileToInsert(file: any, updateTime: number): any;
export declare function mapLinksToInsert(filesToInsert: File[], file: any): any;
export declare function isLinkToDefined(link: any): boolean;
export declare function mapFileTagsToInsert(file: any): {
    file: any;
    tag: string;
    is_referenced: boolean;
    is_declared: boolean;
}[];
export declare function getUniqueValues<T>(inputArray: T[]): T[];
export declare function getUniqueProperties(objects: any[]): string[];
export declare function mapTasksToInsert(file: any): any;
