import { Knex } from "knex";
export declare enum Table {
    Files = "files",
    Tags = "tags",
    FileTags = "file_tags",
    Links = "links",
    Tasks = "tasks"
}
type MetaData = {
    [key: string]: any;
};
interface File {
    _id: string;
    metadata: MetaData | null;
    [key: string]: any;
}
declare class MddbFile {
    static table: Table;
    static supportedExtensions: string[];
    static defaultProperties: string[];
    _id: string;
    file_path: string;
    extension: string;
    url_path: string | null;
    filetype: string | null;
    metadata: MetaData | null;
    [key: string]: any;
    constructor(file: any);
    toObject(): File;
    static createTable(db: Knex, properties: string[]): Promise<void>;
    static deleteTable(db: Knex): Promise<void>;
    static batchInsert(db: Knex, files: File[]): Promise<unknown[]>;
}
interface Link {
    link_type: "normal" | "embed";
    from: string;
    to: string;
}
declare class MddbLink {
    static table: Table;
    link_type: "normal" | "embed";
    from: string;
    to: string;
    constructor(link: any);
    toObject(): Link;
    static createTable(db: Knex): Promise<void>;
    static deleteTable(db: Knex): Promise<void>;
    static batchInsert(db: Knex, links: Link[]): Promise<unknown[]>;
}
interface Tag {
    name: string;
}
declare class MddbTag {
    static table: Table;
    name: string;
    constructor(tag: any);
    toObject(): Tag;
    static createTable(db: Knex): Promise<void>;
    static deleteTable(db: Knex): Promise<void>;
    static batchInsert(db: Knex, tags: Tag[]): Promise<unknown[]>;
}
interface FileTag {
    tag: string;
    file: string;
    is_referenced: boolean;
    is_declared: boolean;
}
declare class MddbFileTag {
    static table: Table;
    tag: string;
    is_declared: boolean;
    is_referenced: boolean;
    file: string;
    constructor(fileTag: any);
    static createTable(db: Knex): Promise<void>;
    static deleteTable(db: Knex): Promise<void>;
    static batchInsert(db: Knex, fileTags: FileTag[]): Promise<unknown[]>;
}
interface Task {
    description: string;
    checked: boolean;
    due: string | null;
    completion: string | null;
    created: string;
    start: string | null;
    scheduled: string | null;
    list: string | null;
    metadata: MetaData | null;
}
declare class MddbTask {
    static table: Table;
    description: string;
    checked: boolean;
    due: string | null;
    completion: string | null;
    created: string;
    start: string | null;
    scheduled: string | null;
    list: string | null;
    metadata: MetaData | null;
    constructor(task: Task);
    static createTable(db: Knex): Promise<void>;
    static deleteTable(db: Knex): Promise<void>;
    static batchInsert(db: Knex, tasks: Task[]): Promise<unknown[]>;
}
export { MetaData, File, MddbFile, Link, MddbLink, Tag, MddbTag, FileTag, MddbFileTag, Task, MddbTask };
