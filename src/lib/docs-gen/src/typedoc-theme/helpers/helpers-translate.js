

module.exports = {
    customLocalize (parent, property) {
        const selectedLanguage = process.env.lang;
        const languageDictionary = require(`../../../output-translations/translation-${selectedLanguage}.json`);
        let parentCleansed = "";
        let parentExists = false;
        if (parent) {
            parentExists = true;
            parentCleansed = parent.replace(/[\W_]+/g, "").toLowerCase(); // Replace non-alphanumeric

            /**
             * The json-schema-to-typescript library generates duplicate classes such as ALBConfig and ALBConfig1
             * These classes are the same, so when retrieving translations from translation-en.json, 
             * when parent key is ALBConfig1/2/3/etc , replace it with ALBConfig so the translation can
             * be retrieved. Below statements remove the last digit.
             */
            const isLastCharacterANumber = !isNaN(parentCleansed.charAt(parentCleansed.length - 1));
            if (isLastCharacterANumber) {parentCleansed = parentCleansed.slice(0, -1);}
        }

        let translation = "";
        if (parentExists) {
            translation = languageDictionary[selectedLanguage][`i18n-${parentCleansed}-${property}`];
        } else {translation = englishDict.en[`i18n-${property}`];}
        return translation;
    }
}