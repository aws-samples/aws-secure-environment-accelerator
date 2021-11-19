const englishDict = require('../i18n/base-en.json');
const frenchDict = require('../i18n/base-fr.json');

export class TranslationExtractHelper {
  typeDocTranslation: any = {};
  selectedLanguage: string;
  constructor(selectedLanguage: string) {
    this.selectedLanguage = selectedLanguage;
    this.typeDocTranslation[`${selectedLanguage}`] = {};
  }

  public iterate(obj: any, parentProperty: string) {
    // eslint-disable-next-line guard-for-in
    for (const property in obj.fields) {
      const propertyObject = obj.fields[property];

      const titleTranslated = this.translate('Title', this.selectedLanguage);
      const titleField = this.generateTitle(propertyObject.title, property);
      const descriptionTranslated = this.translate('Description', this.selectedLanguage);
      const computedProperty = this.generateProperty(property, parentProperty);
      this.typeDocTranslation[`${this.selectedLanguage}`][
        `${computedProperty}`
      ] = `<b>${titleTranslated}:</b> ${titleField}<br/><b>${descriptionTranslated}:</b> ${propertyObject.description}`;
    }
    if (obj.properties) {
      // eslint-disable-next-line guard-for-in
      for (const property in obj.properties) {
        this.iterate(obj.properties[property], obj.properties[property].title);
      }
    }
    if (obj.additionalProperties) {
      this.iterate(obj.additionalProperties, obj.additionalProperties.title);
    }
    if (obj.items) {
      this.iterate(obj.items, obj.items.title);
    }
    if (obj.oneOf) {
      for (const oneOfObj of obj.oneOf) {
        this.iterate(oneOfObj, oneOfObj.title);
      }
    }
  }
  private generateTitle(title: string, propertyName: string) {
    if (title && title.trim().length > 0) {
      return title;
    }

    const newTitle = `${propertyName}`
      .replace(new RegExp(/[^\w]/, 'g'), ' ') // Remove non-word characters such as '-'
      .replace(
        new RegExp(/(\w)(\w*)/, 'g'), // Grab first character and remainder of the word so we can Pascale Case it
        ($1, $2, $3) => {
          return `${$2.toUpperCase() + $3.toLowerCase()}`;
        },
      );
    return newTitle;
  }
  private translate(key: string, selectedLanguage: string) {
    if (selectedLanguage === 'fr') {
      return frenchDict.fr[key];
    } else {
      return englishDict.en[key];
    }
  }
  private generateProperty(property: string, parentProperty: string) {
    let i18nProperty = '';
    if (!parentProperty) {
      i18nProperty = `i18n-${property}`;
    } else {
      const parentPropertyLowerCased = parentProperty.replace(/[\W_]+/g, '').toLowerCase(); // Replace non-alphanumeric
      i18nProperty = `i18n-${parentPropertyLowerCased}-${property}`;
    }
    return i18nProperty;
  }
}
