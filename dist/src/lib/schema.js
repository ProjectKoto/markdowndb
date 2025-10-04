import { areUniqueObjectsByKey } from "./validate.js";
/*
 * Types
 */
export var Table;
(function (Table) {
    Table["Files"] = "files";
    Table["Tags"] = "tags";
    Table["FileTags"] = "file_tags";
    Table["Links"] = "links";
    Table["Tasks"] = "tasks";
})(Table || (Table = {}));
class MddbFile {
    // TODO type?
    constructor(file) {
        if (!file) {
            return;
        }
        Object.keys(file).forEach((key) => {
            if (key === "metadata") {
                this[key] = file[key] ? JSON.parse(file[key]) : null;
            }
            else {
                this[key] = file[key];
            }
        });
    }
    toObject() {
        return { ...this.file };
    }
    static async createTable(db, properties) {
        const creator = (table) => {
            table.string("_id").primary();
            table.string("asset_raw_path", 16384).unique().notNullable();
            table.string("asset_locator", 16384);
            table.string("asset_type");
            table.string("asset_store_tag", 32);
            table.bigInteger("asset_size");
            table.boolean("is_asset_heavy");
            table.boolean("has_derived_children");
            table.string("deriving_parent_id", 128);
            table.binary("asset_raw_bytes");
            table.string("origin_file_path", 16384).notNullable();
            table.string("origin_file_extension", 16).notNullable();
            table.text("metadata", "LONGTEXT");
            table.text("links", "LONGTEXT");
            table.bigInteger("publish_time_by_metadata");
            table.boolean("is_deleted_by_hoard");
            table.bigInteger("update_time_by_hoard");
            properties.forEach((property) => {
                if (MddbFile.defaultProperties.indexOf(property) === -1 &&
                    ["tags", "referencedTags", "declaredTags", "links"].indexOf(property) === -1) {
                    table.string(property);
                }
            });
        };
        const tableExists = await db.schema.hasTable(this.table);
        if (!tableExists) {
            await db.schema.createTable(this.table, creator);
        }
    }
    static async deleteTable(db) {
        await db.schema.dropTableIfExists(this.table);
    }
    static batchInsert(db, files) {
        if (!areUniqueObjectsByKey(files, "_id")) {
            throw new Error("Files must have unique _id");
        }
        if (!areUniqueObjectsByKey(files, "asset_raw_path")) {
            throw new Error("Files must have unique asset_raw_path");
        }
        const serializedFiles = files.map((file) => {
            const serializedFile = {};
            Object.keys(file).forEach((key) => {
                const value = file[key];
                // If the value is undefined, default it to null
                if (value !== undefined) {
                    const shouldStringify = (key === "metadata" || key === "links" || !MddbFile.defaultProperties.includes(key)) &&
                        typeof value === "object";
                    // Stringify all user-defined fields and metadata
                    serializedFile[key] = shouldStringify ? JSON.stringify(value) : value;
                }
                else {
                    serializedFile[key] = null;
                }
            });
            return serializedFile;
        });
        {
            const promises = [];
            for (let i = 0; i < serializedFiles.length; i += 500) {
                const currBatchI = i;
                promises.push((async () => {
                    const currBatch = serializedFiles.slice(currBatchI, currBatchI + 500);
                    // console.log(currBatch);
                    await db(Table.Files).delete().whereIn("_id", currBatch.map(f => f._id));
                    return await db.batchInsert(Table.Files, currBatch);
                })());
            }
            return Promise.all(promises);
        }
    }
}
MddbFile.table = Table.Files;
MddbFile.supportedExtensions = ["md", "mdx"];
MddbFile.defaultProperties = [
    "_id",
    "asset_raw_path",
    "asset_locator",
    "asset_type",
    "asset_store_tag",
    "asset_size",
    "is_asset_heavy",
    "has_derived_children",
    "deriving_parent_id",
    "asset_raw_bytes",
    "origin_file_path",
    "origin_file_extension",
    "metadata",
    "links",
    "publish_time_by_metadata",
    "is_deleted_by_hoard",
    "update_time_by_hoard",
];
class MddbLink {
    // TODO type?
    constructor(link) {
        // this._id = dbLink._id;
        this.link_type = link.link_type;
        this.from = link.from;
        this.to = link.to;
    }
    toObject() {
        return {
            link_type: this.link_type,
            from: this.from,
            to: this.to,
        };
    }
    static async createTable(db) {
        const creator = (table) => {
            // table.string("_id").primary();
            table.enum("link_type", ["normal", "embed"]).notNullable();
            table.string("from", 16384).notNullable();
            table.string("to", 16384).notNullable();
            /* table.foreign("from").references("files._id").onDelete("CASCADE"); */
            /* table.foreign("to").references("files._id").onDelete("CASCADE"); */
        };
        const tableExists = await db.schema.hasTable(this.table);
        if (!tableExists) {
            await db.schema.createTable(this.table, creator);
        }
    }
    static async deleteTable(db) {
        await db.schema.dropTableIfExists(this.table);
    }
    static batchInsert(db, links) {
        if (links.length >= 500) {
            const promises = [];
            for (let i = 0; i < links.length; i += 500) {
                promises.push(db.batchInsert(Table.Links, links.slice(i, i + 500)));
            }
            return Promise.all(promises);
        }
        else {
            return db.batchInsert(Table.Links, links);
        }
    }
}
MddbLink.table = Table.Links;
class MddbTag {
    // description: string;
    // TODO type?
    constructor(tag) {
        this.name = tag.name;
        // this.description = dbTag.description;
    }
    toObject() {
        return {
            name: this.name,
            // description: this.description,
        };
    }
    static async createTable(db) {
        const creator = (table) => {
            table.string("name", 16384).primary();
            // table.string("description");
        };
        const tableExists = await db.schema.hasTable(this.table);
        if (!tableExists) {
            await db.schema.createTable(this.table, creator);
        }
    }
    static async deleteTable(db) {
        await db.schema.dropTableIfExists(this.table);
    }
    static batchInsert(db, tags) {
        if (!areUniqueObjectsByKey(tags, "name")) {
            throw new Error("Tags must have unique name");
        }
        if (tags.length >= 500) {
            const promises = [];
            for (let i = 0; i < tags.length; i += 500) {
                promises.push(db.batchInsert(Table.Tags, tags.slice(i, i + 500)));
            }
            return Promise.all(promises);
        }
        else {
            return db.batchInsert(Table.Tags, tags);
        }
    }
}
MddbTag.table = Table.Tags;
class MddbFileTag {
    constructor(fileTag) {
        this.tag = fileTag.tag;
        this.is_declared = fileTag.is_declared;
        this.is_referenced = fileTag.is_referenced;
        this.file = fileTag.file;
    }
    static async createTable(db) {
        const creator = (table) => {
            table.string("tag", 16384).notNullable();
            table.string("file").notNullable();
            table.boolean("is_declared").notNullable();
            table.boolean("is_referenced").notNullable();
            // TODO this is now saved as tag name, not as tag id ...
            table.foreign("tag").references("tags.name").onDelete("CASCADE");
            table.foreign("file").references("files._id").onDelete("CASCADE");
        };
        const tableExists = await db.schema.hasTable(this.table);
        if (!tableExists) {
            await db.schema.createTable(this.table, creator);
        }
    }
    static async deleteTable(db) {
        await db.schema.dropTableIfExists(this.table);
    }
    static batchInsert(db, fileTags) {
        if (fileTags.length >= 500) {
            const promises = [];
            for (let i = 0; i < fileTags.length; i += 500) {
                promises.push(db.batchInsert(Table.FileTags, fileTags.slice(i, i + 500)));
            }
            return Promise.all(promises);
        }
        else {
            return db.batchInsert(Table.FileTags, fileTags);
        }
    }
}
MddbFileTag.table = Table.FileTags;
class MddbTask {
    constructor(task) {
        this.description = task.description;
        this.checked = task.checked;
        this.due = task.due;
        this.completion = task.completion;
        this.created = task.created;
        this.start = task.start;
        this.scheduled = task.scheduled;
        this.list = task.list;
        this.metadata = task.metadata;
    }
    static async createTable(db) {
        const creator = (table) => {
            table.text("description", "LONGTEXT").notNullable();
            table.boolean("checked").notNullable();
            table.string("file").notNullable();
            table.string("due");
            table.string("completion");
            table.string("created");
            table.string("start");
            table.string("scheduled");
            table.string("list");
            table.text("metadata", "LONGTEXT");
        };
        const tableExists = await db.schema.hasTable(this.table);
        if (!tableExists) {
            await db.schema.createTable(this.table, creator);
        }
    }
    static async deleteTable(db) {
        await db.schema.dropTableIfExists(this.table);
    }
    static batchInsert(db, tasks) {
        if (tasks.length >= 500) {
            const promises = [];
            for (let i = 0; i < tasks.length; i += 500) {
                promises.push(db.batchInsert(Table.Tasks, tasks.slice(i, i + 500)));
            }
            return Promise.all(promises);
        }
        else {
            return db.batchInsert(Table.Tasks, tasks);
        }
    }
}
MddbTask.table = Table.Tasks;
export { MddbFile, MddbLink, MddbTag, MddbFileTag, MddbTask };
