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

import React, { FC, useContext, useState } from 'react';
import { Credentials } from '@aws-sdk/types';
import { Box, Button, FormField, Header, Input, Modal, SpaceBetween } from '@awsui/components-react';
import { useInput, useStorage } from '@/utils/hooks';

import './aws-credentials-context.scss';
import { useI18n } from './i18n-context';

export interface AwsConfiguration {
  region?: string;
  credentials?: Credentials;
}

export interface UseAwsConfiguration {
  configuration: AwsConfiguration;
  setModalVisible: (visible: boolean) => void;
}

const AwsCredentialsContext = React.createContext<UseAwsConfiguration | undefined>(undefined);

/**
 * Context provider that provides AWS credentials context and allows sub-components to open the credentials modal.
 */
export const AwsCredentialsProvider: FC = ({ children }) => {
  const [configuration, setConfiguration] = useStorage<AwsConfiguration>('aws.configuration', {});
  const [isModalVisible, setModalVisible] = useState(false);
  const { tr } = useI18n();

  const awsRegionInputProps = useInput(configuration?.region);
  const awsAccessKeyIdInputProps = useInput(configuration?.credentials?.accessKeyId);
  const awsSecretAccessKeyInputProps = useInput(configuration?.credentials?.secretAccessKey);
  const awsSessionTokenInputProps = useInput(configuration?.credentials?.sessionToken);

  const handleSubmit = () => {
    // TODO Validate credentials
    setConfiguration({
      region: awsRegionInputProps.value,
      credentials: {
        accessKeyId: awsAccessKeyIdInputProps.value,
        secretAccessKey: awsSecretAccessKeyInputProps.value,
        sessionToken: awsSessionTokenInputProps.value,
      },
    });
    setModalVisible(false);
  };

  const handleDismiss = () => {
    setModalVisible(false);
  };

  return (
    <AwsCredentialsContext.Provider value={{ configuration, setModalVisible }}>
      {children}
      <Modal
        className="aws-credentials-modal"
        visible={isModalVisible}
        onDismiss={handleDismiss}
        header={<Header variant="h3">{tr('headers.configure_credentials')}</Header>}
        footer={
          <Box float="right">
            <Button variant="link" onClick={handleDismiss}>
              {tr('buttons.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              {tr('buttons.save')}
            </Button>
          </Box>
        }
      >
        <SpaceBetween direction="vertical" size="s">
          <FormField label="AWS Region">
            <Input {...awsRegionInputProps} />
          </FormField>
          <FormField label="AWS Access Key ID">
            <Input {...awsAccessKeyIdInputProps} type="password" />
          </FormField>
          <FormField label="AWS Secret Access Key">
            <Input {...awsSecretAccessKeyInputProps} type="password" />
          </FormField>
          <FormField label="AWS Session Token">
            <Input {...awsSessionTokenInputProps} type="password" />
          </FormField>
        </SpaceBetween>
      </Modal>
    </AwsCredentialsContext.Provider>
  );
};

export function useAwsConfiguration(): UseAwsConfiguration {
  return useContext(AwsCredentialsContext)!;
}
