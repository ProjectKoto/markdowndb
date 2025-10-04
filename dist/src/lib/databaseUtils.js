import { MddbTag, MddbTask, MddbLink, MddbFileTag } from "./schema.js";
import path from "path";
export async function resetDatabaseTables(db) {
    const tableNames = [MddbTag, MddbFileTag, MddbLink, MddbTask];
    // Drop and Create tables
    for (const table of tableNames) {
        await table.deleteTable(db);
        await table.createTable(db);
    }
}
export function mapFileToInsert(file, updateTime) {
    // const { tags, links, ...rest } = file;
    const { referencedTags, declaredTags, ...rest } = file;
    // return { ...rest };
    const overrider = {};
    if (file.update_time_by_hoard === undefined) {
        overrider.update_time_by_hoard = updateTime;
    }
    return { ...rest, ...overrider };
}
export function mapLinksToInsert(filesToInsert, file) {
    return file.links.map((link) => {
        let to;
        if (!link.internal) {
            to = link.toRaw;
        }
        else {
            to = findFileToInsert(filesToInsert, link.to)?._id;
        }
        return {
            from: file._id,
            to: to,
            link_type: link.embed ? "embed" : "normal",
        };
    });
}
function findFileToInsert(filesToInsert, filePath) {
    const filePathWithoutExt = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
    return filesToInsert.find(({ asset_url_path }) => {
        const normalizedFile = path.normalize(asset_url_path || "");
        return normalizedFile === filePathWithoutExt;
    });
}
export function isLinkToDefined(link) {
    return link.to !== undefined;
}
export function mapFileTagsToInsert(file) {
    const refSet = new Set(file.referencedTags);
    const declSet = new Set(file.declaredTags);
    return [...file.referencedTags, ...file.declaredTags].map((tag) => ({
        file: file._id,
        tag: tag,
        is_referenced: refSet.has(tag),
        is_declared: declSet.has(tag),
    }));
}
export function getUniqueValues(inputArray) {
    const uniqueArray = [];
    for (const item of inputArray) {
        if (!uniqueArray.includes(item)) {
            uniqueArray.push(item);
        }
    }
    return uniqueArray;
}
export function getUniqueProperties(objects) {
    const uniqueProperties = [];
    for (const object of objects) {
        for (const key of Object.keys(object)) {
            if (!uniqueProperties.includes(key)) {
                uniqueProperties.push(key);
            }
        }
    }
    return uniqueProperties;
}
export function mapTasksToInsert(file) {
    return file.tasks.map((task) => {
        return {
            file: file._id,
            description: task.description,
            checked: task.checked,
            metadata: JSON.stringify(task.metadata),
            created: task.created,
            due: task.due,
            completion: task.completion,
            start: task.start,
            list: task.list,
            scheduled: task.scheduled,
        };
    });
}
