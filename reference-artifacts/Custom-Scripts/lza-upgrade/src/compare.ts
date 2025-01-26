
import { readFile, writeFile } from 'fs/promises';

export abstract class Compare {
    static async compareMappings(originalMappingPath: string, newMappingPath: string) {
        const originalMappingString = await readFile(originalMappingPath, 'utf8');
        const newMappingString = await readFile(newMappingPath, 'utf8');
        
        const originalMapping = JSON.parse(originalMappingString);
        const newMapping = JSON.parse(newMappingString);

        const newMappingKeys = Object.keys(newMapping);
        const missingKeys = newMappingKeys.filter((key) => !originalMapping[key]);
        const missingMappings = missingKeys.reduce((acc: any, key: string) => {
            acc[key] = newMapping[key];
            return acc
        }, {});
        await writeFile('./outputs/missing-mappings.json', JSON.stringify(missingMappings, null, 2));
        console.log(`Missing mappings written to ./outputs/missing-mappings.json`);
    }

}