export const areUniqueObjectsByKey = (arr, key) => {
    const uniqueValuesToIndexesMap = {};
    const isUnique = !arr.some((item, index) => {
        const value = item[key];
        if (!uniqueValuesToIndexesMap[value]) {
            uniqueValuesToIndexesMap[value] = index;
        }
        else {
            const existingItem = JSON.stringify(arr[uniqueValuesToIndexesMap[value]], null, 2);
            const duplicateItem = JSON.stringify(item, null, 2);
            console.error(`Items with duplicate "${JSON.stringify(key)}" property value found:\n${existingItem}\n\n${duplicateItem}`);
            return true;
        }
    });
    return isUnique;
};
