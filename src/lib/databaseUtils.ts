import { Knex } from "knex";
import { MddbTag, MddbTask, MddbLink, MddbFileTag, File } from "./schema.js";
import path from "path";
import { WikiLink } from "./parseFile.js";

export async function resetDatabaseTables(db: Knex) {
  const tableNames = [MddbTag, MddbFileTag, MddbLink, MddbTask];
  // Drop and Create tables
  for (const table of tableNames) {
    await table.deleteTable(db);
    await table.createTable(db);
  }
}

export function mapFileToInsert(file: any, updateTime: number) {
  // const { tags, links, ...rest } = file;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { referencedTags, declaredTags, ...rest } = file;
  // return { ...rest };
  const overrider: { [x: string]: any } = {}
  if (file.update_time_by_hoard === undefined) {
    overrider.update_time_by_hoard = updateTime;
  }
  return { ...rest, ...overrider };
}

// export function mapLinksToInsert(filesToInsert: File[], file: any) {
//   return file.links.map((link: WikiLink) => {
//     let to: string | undefined;
//     if (!link.internal) {
//       to = link.toRaw;
//     } else {
//       to = findFileToInsert(filesToInsert, link.to)?._id;
//     }
//     return {
//       from: file._id,
//       to: to,
//       link_type: link.embed ? "embed" : "normal",
//     };
//   });
// }

// function findFileToInsert(filesToInsert: File[], filePath: string) {
//   const filePathWithoutExt = path.join(
//     path.dirname(filePath),
//     path.basename(filePath, path.extname(filePath))
//   );

//   // 20260802: tk: no longer works, file no longer has asset_url_path field
//   return filesToInsert.find(({ asset_url_path }) => {
//     const normalizedFile = path.normalize(asset_url_path || "");
//     return normalizedFile === filePathWithoutExt;
//   });
// }

// export function isLinkToDefined(link: any) {
//   return link.to !== undefined;
// }

export function mapFileTagsToInsert(file: any) {
  if (!(file.referencedTags && file.declaredTags)) {
    return [];
  }
  const refSet = new Set(file.referencedTags)
  const declSet = new Set(file.declaredTags)
  return [...file.referencedTags, ...file.declaredTags].map((tag: any) => ({
    file: file._id,
    tag: tag as unknown as string,
    is_referenced: refSet.has(tag),
    is_declared: declSet.has(tag),
  }));
}

export function getUniqueValues<T>(inputArray: T[]): T[] {
  const uniqueArray: T[] = [];

  for (const item of inputArray) {
    if (!uniqueArray.includes(item)) {
      uniqueArray.push(item);
    }
  }

  return uniqueArray;
}

export function getUniqueProperties(objects: any[]): string[] {
  const uniqueProperties: string[] = [];

  for (const object of objects) {
    for (const key of Object.keys(object)) {
      if (!uniqueProperties.includes(key)) {
        uniqueProperties.push(key);
      }
    }
  }

  return uniqueProperties;
}

// export function mapTasksToInsert(file: any) {
//   return file.tasks.map((task: any) => {
//     return {
//       file: file._id,
//       description: task.description,
//       checked: task.checked,
//       metadata: JSON.stringify(task.metadata),
//       created: task.created,
//       due: task.due,
//       completion: task.completion,
//       start: task.start,
//       list: task.list,
//       scheduled: task.scheduled,
//     };
//   });
// }

export function intoBatches<T>(batchSize: number, origList: T[]): T[][] {
  batchSize = Math.floor(batchSize);
  const result = [...Array(Math.floor((origList.length + batchSize - 1) / batchSize)).keys()].map(i => {
    return origList.slice(i * batchSize, Math.min(origList.length, (i + 1) * batchSize));
  });
  return result;
}

export async function runByBatch<T, U>(batchSize: number, origList: T[], batchConverter: (a: T[]) => Promise<U[]>): Promise<U[]> {
  const batches = intoBatches(batchSize, origList);
  const targetList: U[] = [];
  for (const batch of batches) {
    targetList.push(...(await batchConverter(batch)));
  }
  return targetList;
}

// answer to How can I consume an iterable in batches (equally sized chunks)? by Ryan Smith
// https://stackoverflow.com/questions/54369286/how-can-i-consume-an-iterable-in-batches-equally-sized-chunks/66762031#66762031
export async function * asyncGenIntoBatches<T>(batchSize: number, iterable: AsyncIterableIterator<T>) {
  let items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
    if (items.length >= batchSize) {
      yield items;
      items = []
    }
  }
  if (items.length !== 0) {
    yield items;
  }
}

