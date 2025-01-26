
import { readFile, writeFile } from 'fs/promises';

export abstract class Compare {
    static async compareMappings(newMappingPath: string, originalMappingPath: string) {
        const newMappingString = await readFile(newMappingPath, 'utf8');
        const originalMappingString = await readFile(originalMappingPath, 'utf8');
        
        const newMapping = JSON.parse(newMappingString);
        const originalMapping = JSON.parse(originalMappingString);

        const newMappingKeys = Object.keys(newMapping);
        const originalMappingKeys = Object.keys(originalMapping);
        const missingKeys = originalMappingKeys.filter(key => !newMappingKeys.includes(key));
        const missingMappings = missingKeys.reduce((acc: any, key) => {
            acc[key] = originalMapping[key];
            return acc;
        }, {});
        await writeFile('./outputs/missing-mappings.json', JSON.stringify(missingMappings, null, 2));
        console.log(`Missing mappings written to ./outputs/missing-mappings.json`);
    }

}