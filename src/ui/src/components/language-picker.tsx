/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Select, SelectProps } from '@awsui/components-react';
import { useI18n } from '@/components/i18n-context';

export const LanguagePicker: React.VFC = () => {
  const { i18n } = useI18n();

  const options: SelectProps.Option[] = i18n.languages.map(language => ({
    value: language,
    label: i18n.t(`languages.${language}`),
  }));
  const selectedOption = options.find(option => option.value === i18n.language) ?? null;

  const handleLanguageChange: SelectProps['onChange'] = e => {
    const selectedLanguageCode = e.detail.selectedOption.value;
    if (selectedLanguageCode) {
      void i18n.changeLanguage(selectedLanguageCode);
    }
  };

  return <Select options={options} selectedOption={selectedOption} onChange={handleLanguageChange} />;
};
