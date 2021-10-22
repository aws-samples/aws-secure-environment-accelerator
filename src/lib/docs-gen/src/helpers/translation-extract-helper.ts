
export class TranslationExtractHelper {
    typeDocTranslation: any = {};
    selectedLanguage: string;
    constructor(selectedLanguage: string) {
        this.selectedLanguage = selectedLanguage;
        this.typeDocTranslation[`${selectedLanguage}`] = {};
    }

    public iterate(obj: any) {
        for (const property in obj.fields) {
            const propertyObject = obj.fields[property];
            this.typeDocTranslation[`${this.selectedLanguage}`]["i18n-" + property] = `${propertyObject.description}`;
        }
        if (obj.properties) {
            for (const property in obj.properties) {
                this.iterate(obj.properties[property]);
            }
        }
        if (obj.additionalProperties) {
            this.iterate(obj.additionalProperties);
        }

    }
}