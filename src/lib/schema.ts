import { Knex } from "knex";
import { areUniqueObjectsByKey } from "./validate.js";

/*
 * Types
 */
export enum Table {
  Files = "files",
  Tags = "tags",
  FileTags = "file_tags",
  Links = "links",
  Tasks = "tasks",
}

type MetaData = {
  [key: string]: any;
};

/*
 * Schema
 */
interface File {
  _id: string;
  // file_path: string;
  // extension: string;
  // url_path: string | null;
  // filetype: string | null;
  metadata: MetaData | null;
  [key: string]: any;
}

class MddbFile {
  static table = Table.Files;
  static supportedExtensions = ["md", "mdx"];
  static defaultProperties = [
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

  _id: string;
  file_path: string;
  extension: string;
  url_path: string | null;
  // TODO there should be a separate table for filetypes
  // and another one for many-to-many relationship between files and filetypes
  filetype: string | null;
  metadata: MetaData | null;
  [key: string]: any;

  // TODO type?
  constructor(file: any) {
    if (!file) {
      return;
    }
    Object.keys(file).forEach((key) => {
      if (key === "metadata") {
        this[key] = file[key] ? JSON.parse(file[key]) : null;
      } else {
        this[key] = file[key];
      }
    });
  }

  toObject(): File {
    return { ...this.file };
  }

  static async createTable(db: Knex, properties: string[]) {
    const creator = (table: Knex.TableBuilder) => {
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
        if (
          MddbFile.defaultProperties.indexOf(property) === -1 &&
          ["tags", "links"].indexOf(property) === -1
        ) {
          table.string(property);
        }
      });
    };
    const tableExists = await db.schema.hasTable(this.table);

    if (!tableExists) {
      await db.schema.createTable(this.table, creator);
    }
  }

  static async deleteTable(db: Knex) {
    await db.schema.dropTableIfExists(this.table);
  }

  static batchInsert(db: Knex, files: File[]) {
    if (!areUniqueObjectsByKey(files, "_id")) {
      throw new Error("Files must have unique _id");
    }
    if (!areUniqueObjectsByKey(files, "asset_raw_path")) {
      throw new Error("Files must have unique asset_raw_path");
    }

    const serializedFiles = files.map((file) => {
      const serializedFile: any = {};

      Object.keys(file).forEach((key) => {
        const value = file[key];
        // If the value is undefined, default it to null
        if (value !== undefined) {
          const shouldStringify =
            (key === "metadata" || key === "links" || !MddbFile.defaultProperties.includes(key)) &&
            typeof value === "object";
          // Stringify all user-defined fields and metadata
          serializedFile[key] = shouldStringify ? JSON.stringify(value) : value;
        } else {
          serializedFile[key] = null;
        }
      });

      return serializedFile;
    });

    {
      const promises: Promise<unknown>[] = [];
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

interface Link {
  link_type: "normal" | "embed";
  from: string;
  to: string;
}

class MddbLink {
  static table = Table.Links;

  // _id: string;
  link_type: "normal" | "embed";
  from: string;
  to: string;

  // TODO type?
  constructor(link: any) {
    // this._id = dbLink._id;
    this.link_type = link.link_type;
    this.from = link.from;
    this.to = link.to;
  }

  toObject(): Link {
    return {
      link_type: this.link_type,
      from: this.from,
      to: this.to,
    };
  }

  static async createTable(db: Knex) {
    const creator = (table: Knex.TableBuilder) => {
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

  static async deleteTable(db: Knex) {
    await db.schema.dropTableIfExists(this.table);
  }

  static batchInsert(db: Knex, links: Link[]) {
    if (links.length >= 500) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < links.length; i += 500) {
        promises.push(db.batchInsert(Table.Links, links.slice(i, i + 500)));
      }
      return Promise.all(promises);
    } else {
      return db.batchInsert(Table.Links, links);
    }
  }
}

interface Tag {
  name: string;
}

class MddbTag {
  static table = Table.Tags;

  name: string;
  // description: string;

  // TODO type?
  constructor(tag: any) {
    this.name = tag.name;
    // this.description = dbTag.description;
  }

  toObject(): Tag {
    return {
      name: this.name,
      // description: this.description,
    };
  }

  static async createTable(db: Knex) {
    const creator = (table: Knex.TableBuilder) => {
      table.string("name", 16384).primary();
      // table.string("description");
    };
    const tableExists = await db.schema.hasTable(this.table);

    if (!tableExists) {
      await db.schema.createTable(this.table, creator);
    }
  }

  static async deleteTable(db: Knex) {
    await db.schema.dropTableIfExists(this.table);
  }

  static batchInsert(db: Knex, tags: Tag[]) {
    if (!areUniqueObjectsByKey(tags, "name")) {
      throw new Error("Tags must have unique name");
    }

    if (tags.length >= 500) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < tags.length; i += 500) {
        promises.push(db.batchInsert(Table.Tags, tags.slice(i, i + 500)));
      }
      return Promise.all(promises);
    } else {
      return db.batchInsert(Table.Tags, tags);
    }
  }
}

interface FileTag {
  tag: string;
  file: string;
}

class MddbFileTag {
  static table = Table.FileTags;
  // _id: string;
  tag: string;
  file: string;

  constructor(fileTag: any) {
    this.tag = fileTag.tag;
    this.file = fileTag.file;
  }

  static async createTable(db: Knex) {
    const creator = (table: Knex.TableBuilder) => {
      table.string("tag", 16384).notNullable();
      table.string("file").notNullable();

      // TODO this is now saved as tag name, not as tag id ...
      table.foreign("tag").references("tags.name").onDelete("CASCADE");
      table.foreign("file").references("files._id").onDelete("CASCADE");
    };
    const tableExists = await db.schema.hasTable(this.table);

    if (!tableExists) {
      await db.schema.createTable(this.table, creator);
    }
  }

  static async deleteTable(db: Knex) {
    await db.schema.dropTableIfExists(this.table);
  }

  static batchInsert(db: Knex, fileTags: FileTag[]) {
    if (fileTags.length >= 500) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < fileTags.length; i += 500) {
        promises.push(
          db.batchInsert(Table.FileTags, fileTags.slice(i, i + 500))
        );
      }
      return Promise.all(promises);
    } else {
      return db.batchInsert(Table.FileTags, fileTags);
    }
  }
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

class MddbTask {
  static table = Table.Tasks;
  description: string;
  checked: boolean;
  due: string | null;
  completion: string | null;
  created: string;
  start: string | null;
  scheduled: string | null;
  list: string | null;
  metadata: MetaData | null;

  constructor(task: Task) {
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

  static async createTable(db: Knex) {
    const creator = (table: Knex.TableBuilder) => {
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

  static async deleteTable(db: Knex) {
    await db.schema.dropTableIfExists(this.table);
  }

  static batchInsert(db: Knex, tasks: Task[]) {
    if (tasks.length >= 500) {
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < tasks.length; i += 500) {
        promises.push(db.batchInsert(Table.Tasks, tasks.slice(i, i + 500)));
      }
      return Promise.all(promises);
    } else {
      return db.batchInsert(Table.Tasks, tasks);
    }
  }
}

export { MetaData, File, MddbFile, Link, MddbLink, Tag, MddbTag, FileTag, MddbFileTag, Task, MddbTask };
