/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
