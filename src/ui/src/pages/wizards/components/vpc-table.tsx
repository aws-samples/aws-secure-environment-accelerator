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
import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  FormField,
  Grid,
  Header,
  Input,
  Modal,
  Select,
  SpaceBetween,
  StatusIndicator,
  Table,
  TokenGroup,
} from '@awsui/components-react';
import * as c from '@aws-accelerator/config';
import { useI18n } from '@/components/i18n-context';
import { TypeTreeNode } from '@/types';
import { AcceleratorConfigurationNode } from '../configuration';
import { LabelWithDescription } from './label-with-description';
import { OptionDefinition } from '../../../../node_modules/@awsui/components-react/internal/components/option/interfaces';
import { useCheckboxInput, useInput } from '@/utils/hooks';

const ouConfigNode = AcceleratorConfigurationNode.nested('organizational-units');
const mandatoryAccountConfigNode = AcceleratorConfigurationNode.nested('mandatory-account-configs');
const workloadAccountConfigNode = AcceleratorConfigurationNode.nested('workload-account-configs');

interface SimpleVpcUnitValue {
  name: string; 
  description: string;
  deploy: string; 
  region: string;
  cidr: any[];
  'tgw-attach': any,
  subnets: any,
  guiCidr: any,
}

export interface VpcTableProps {
  state: any;
}

export const VpcTable: React.VFC<VpcTableProps> = observer(({ state }) => {
  const { tr } = useI18n();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SimpleVpcUnitValue | undefined>();
  const [modalInitialValue, setModalInitialValue] = useState<Partial<SimpleVpcUnitValue>>({});
  
  const nodes = getVpcNodes(state);

  const nodesList: any[] = []
  const populateNodesList = () => {
    for (let each in nodes) {
      nodesList.push(nodes[each].get(state) ?? {})
    }
  }

  populateNodesList() 

  const makeCidrList = (cidrPool: any) => {
    let cidrList = []
    for (let each in cidrPool) {
      cidrList.push(["(" + cidrPool[each].pool + ", " + cidrPool[each].size] + ")")
    }
    return cidrList
  }

  const organizationalUnitsNode = AcceleratorConfigurationNode.nested('organizational-units').get(state);
  const mandatoryAccountConfigNodeState = AcceleratorConfigurationNode.nested('mandatory-account-configs').get(state);

  const getDefinedIn = (vpcName: string) => {
    return vpcName in organizationalUnitsNode ? 'Organizational Unit' : 'Account';
  }

  const isSubnetShared = (vpcName: string) => {
    if (vpcName in organizationalUnitsNode) {
      return organizationalUnitsNode[vpcName]['vpc'][0].subnets?.find((s: any) => s['share-to-ou-accounts'] || s['share-to-specific-accounts']) != null;
    } else if ((vpcName.toLowerCase()) in mandatoryAccountConfigNodeState) {
      return mandatoryAccountConfigNodeState[vpcName.toLowerCase()]['vpc'][0].subnets?.find((s: any) => s['share-to-ou-accounts'] || s['share-to-specific-accounts']) != null;
    } else {
      for (let each in mandatoryAccountConfigNodeState) {
        if(mandatoryAccountConfigNodeState.hasOwnProperty('vpc') && mandatoryAccountConfigNodeState[each]['vpc'][0]['name'] === vpcName) {
          return mandatoryAccountConfigNodeState[each]['vpc'][0].subnets?.find((s: any) => s['share-to-ou-accounts'] || s['share-to-specific-accounts']) != null;
        }
      }
    }
  }

  const isTgwAttached = (vpcName: string) => {
    if (vpcName in organizationalUnitsNode) {
      return organizationalUnitsNode[vpcName]['vpc'][0].hasOwnProperty('tgw-attach')
    } else if ((vpcName.toLowerCase()) in mandatoryAccountConfigNodeState) {
      return mandatoryAccountConfigNodeState[vpcName.toLowerCase()]['vpc'][0].hasOwnProperty('tgw-attach');
    } else {
      for (let each in mandatoryAccountConfigNodeState) {
        if(mandatoryAccountConfigNodeState.hasOwnProperty('vpc') && mandatoryAccountConfigNodeState[each]['vpc'][0]['name'] === vpcName) {
          return mandatoryAccountConfigNodeState[each]['vpc'][0].hasOwnProperty('tgw-attach');
        }
      }
    }
  }

  const vpcItems: SimpleVpcUnitValue[] = Object.entries(nodesList).map(
    ([key, vpcConfig]: [string, any]) => {
      return {
        name: vpcConfig?.name,
        description: vpcConfig?.description ?? '',
        deploy: vpcConfig?.deploy ?? '',
        region: vpcConfig?.region,
        cidr: vpcConfig?.cidr,
        "tgw-attach": vpcConfig?.['tgw-attach'],
        subnets: vpcConfig?.subnets,
        guiCidr: makeCidrList(vpcConfig?.cidr)
      };
    },
  );

  const handleEdit = () => {
    setModalInitialValue(selectedItem ?? {});
    setModalVisible(true);
  };

  const handleSubmit = action((value: SimpleVpcUnitValue) => {
    const {name, deploy, region, cidr} = value; 
    for (let each in nodesList) {
      if (nodesList[each].name === name) {
        nodesList[each].deploy = deploy; 
        nodesList[each].region = region;
        nodesList[each].cidr = cidr;  
      }
    }
    setModalVisible(false);
  })

  return (
    <>
      {
        <EditVpcModal
          visible={modalVisible}
          initialValue={modalInitialValue}
          state={state}
          onDismiss={() => setModalVisible(false)}
          onSubmit={handleSubmit}
        />
      }
      <Table
        items={vpcItems}
        trackBy="name"
        selectionType="single"
        selectedItems={selectedItem ? [selectedItem] : []}
        onSelectionChange={e => setSelectedItem(e.detail.selectedItems?.[0])}
        columnDefinitions={[
          {
            header: 'Name',
            cell: ({ name, description }) => <LabelWithDescription label={name} description={description} />,
          },
         {
            header: 'Defined in',
            cell: ({ name }) => getDefinedIn(name),
          },
          {
            header: 'Deploy',
            cell: ({ deploy }) => deploy,
          },
          
          {
            header: 'Shared',
            cell: ({ name }) => (isSubnetShared( name ) ? 'Yes' : 'No'),
          },
          
          {
            header: 'TGW Attached',
            cell: ({ name }) => (isTgwAttached(name) ? 'Yes' : 'No'),
          },
          {
            header: 'Region',
            cell: ({ region }) => region,
          },
          {
            header: 'CIDR Pool(s) and Size',
            cell: ({ guiCidr }) => guiCidr.join(" || ")
          },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${nodes.length})`}
            description={tr('wizard.headers.vpcs_desc')}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button disabled={selectedItem == null} onClick={handleEdit}>
                  {tr('buttons.edit')}
                </Button>
              </SpaceBetween>
            }
          >
            {tr('wizard.headers.vpcs')}
          </Header>
        }
        footer={<StatusIndicator type="info">{tr('wizard.labels.vpcs_use_graphical_editor')}</StatusIndicator>}
      />
    </>
  );
});

interface EditVpcModalProps {
  visible: boolean;
  initialValue: Partial<SimpleVpcUnitValue>;
  state: any;
  onDismiss: () => void;
  onSubmit: (value: SimpleVpcUnitValue) => void;
}

const EditVpcModal = ({
  visible,
  initialValue, 
  state,
  onDismiss, 
  onSubmit
}: EditVpcModalProps) => {
  const { tr } = useI18n();
  const nameInputProps = useInput();
  const useSharedInputProps = useCheckboxInput();
  const useTGWProps = useCheckboxInput();

  const organizationalUnitsNode = AcceleratorConfigurationNode.nested('organizational-units').get(state);
  const mandatoryAccountConfigNodeState = AcceleratorConfigurationNode.nested('mandatory-account-configs').get(state);
  const regionsNode = AcceleratorConfigurationNode.nested('global-options').nested('supported-regions');
  const regionsNodeState = regionsNode.get(state) ?? {}

  var modalCidrList: any[] = []

  const makeCidrList = () => {
    for (const each in initialValue.cidr) {
      let entry = [initialValue.cidr[parseInt(each)].pool, initialValue.cidr[parseInt(each)].size].join(", ")
      modalCidrList.push({label: entry, dismissLabel: entry})
    }
  }
  console.log(modalCidrList)

  const [deployOption, setDeployOption] = useState<OptionDefinition>({ label: initialValue.deploy, value: initialValue.deploy });
  const [regionOption, setRegionOption] = useState<OptionDefinition>({ label: initialValue.region, value: initialValue.region });
  const [cidrList, setCidrList] = useState<any[]>([]);
  const [newCidr, setNewCidr] = useState("");
  const [newCidrSize, setNewCidrSize] = useState<OptionDefinition>({ label: '16', value: '16' });

  const configCidrList = (cidrs: any[]) => {
    var configCidrList: any[] = []
    for (let each in cidrs) {
      var cidrSplit = cidrs[each].label.split(", ")
      configCidrList.push(
        { 
          pool: cidrSplit[0],
          size: parseInt(cidrSplit[1]),
        }
      )
    }
    return configCidrList
  }

  const handleSubmit = () => {
    onSubmit({
      name: initialValue.name ?? '',
      description: initialValue.description ?? '',
      deploy: deployOption.value ?? '',
      region: regionOption.value ?? '',
      cidr: configCidrList(cidrList),
      "tgw-attach": initialValue['tgw-attach'],
      subnets: initialValue['subnets'],
      guiCidr: initialValue.guiCidr
    })
  }

  useEffect(() => {
    makeCidrList()
    setCidrList([...modalCidrList])
    setDeployOption({ label: initialValue.deploy, value: initialValue.deploy })
    setRegionOption({ label: initialValue.region, value: initialValue.region })
  }, [visible]);

var options: { label: string; value: string; }[] = []
const populateSelect = () => {
  for (const each in regionsNodeState) {
    options.push({label: regionsNodeState[each], value: regionsNodeState[each]})
  }
}


var cidrSizeOptions: {label: string; value: string; }[] = []
const populateSize = () => {
  for (let i=16; i <= 24; i++) {
    cidrSizeOptions.push({label: String(i), value: String(i)})
  }
}


const vpcTitle = {title: "VPC Name", desc: "The name of the VPC that will be deployed"}
const definedIn = {title: "Defined in", desc: "The location in which this VPC is defined in"}
const deployTitle = {title: "Deploy", desc: "Local if being configured inside an account or shared-network if being configured inside an OU"}
const regionTitle = {title: "Region", desc: "Region for the VPC"}
const cidrPoolTitle = {title: "CIDR Pool Name & Size", desc: "The name of the CIDR pool to assign IP addresses from and the size of the CIDR pool to assign to the VPC. Size must be between 16-28."}

const getDefinedIn = (vpcName: string) => {
  return organizationalUnitsNode && (vpcName in organizationalUnitsNode) ? 'Organizational Unit' : 'Account';
}

  return (
    <Modal
    visible={visible}
    header={<Header variant="h3">{tr('wizard.headers.edit_vpc')}</Header>}
    footer={
      <Button variant="primary" className="float-button" onClick={handleSubmit}>
        {tr('buttons.save_changes')}
      </Button>
    }
    onDismiss={onDismiss}
  >
    <form
      onSubmit={event => {
        event.stopPropagation();
        event.preventDefault();
        handleSubmit();
      }}
    >
      {populateSize()}
      {populateSelect()}
      <SpaceBetween size="s">
        <FormField label={vpcTitle.title} description={vpcTitle.desc}>
          <Input value={String(initialValue.name)} disabled />
        </FormField>
        <FormField label={definedIn.title} description={definedIn.desc} stretch>
          <Input value={getDefinedIn(String(initialValue.name))} disabled />
        </FormField>
        <FormField label={deployTitle.title} description={deployTitle.desc} stretch>
          <Select
              selectedOption={deployOption}
              onChange={({ detail }) =>
                setDeployOption(detail.selectedOption)
              }
              options={[
              { label: "shared-network", value: "shared-network" },
              { label: "local", value: "local" },]}
              selectedAriaLabel="Selected"
            />
          </FormField>
          <FormField label={regionTitle.title} description={regionTitle.desc} stretch>
          <Select
              selectedOption={regionOption}
              onChange={({ detail }) =>
                setRegionOption(detail.selectedOption)
              }
              options={options}
              selectedAriaLabel="Selected"
            />
          </FormField>
          <FormField label={cidrPoolTitle.title} description={cidrPoolTitle.desc} stretch>
          <SpaceBetween size="xs">
            <TokenGroup
              onDismiss={({ detail: { itemIndex } }) => {
                setCidrList([
                  ...cidrList.slice(0, itemIndex),
                  ...cidrList.slice(itemIndex + 1)
                ]);
              }}
              items={cidrList}
            />
            <Grid
              gridDefinition={[{ colspan: 5}, { colspan: 5 }, {colspan: 2}]}
            >
              <div> 
                <Input
                  placeholder="Enter CIDR Name"
                  onChange={({ detail }) => setNewCidr(detail.value)}
                  value={newCidr}
                />
              </div>
              <div> 
              <Select
                placeholder="Enter CIDR Size"
                selectedOption={newCidrSize}
                onChange={({ detail }) =>
                  setNewCidrSize(detail.selectedOption)
                }
                options={cidrSizeOptions}
                selectedAriaLabel="Selected"
              />
               
              </div>
              <div>
                <Button 
                  variant="normal" 
                  formAction="none"
                  onClick={
                    () => {
                      cidrList.push({label: newCidr + ", " + newCidrSize.value, dismissLabel: "Remove item"})
                      setCidrList([...cidrList])
                  }}
                  >Add</Button>
              </div>
            </Grid>
          </SpaceBetween>
          </FormField>
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox checked disabled />
            <span>Subnet shared <i>(Edit temporarily disabled)</i></span>
          </SpaceBetween>
          <SpaceBetween size="s" direction="horizontal">
            <Checkbox
              checked
              disabled
            />
            <span>Transit gateway attached <i>(Edit temporarily disabled)</i></span>
            </SpaceBetween>
      </SpaceBetween>
    </form>
  </Modal>
);
};

export function getVpcNodes(state: any) {
    return [
    ...getAccountOrOuVpcNodes(ouConfigNode, state),
    ...getAccountOrOuVpcNodes(mandatoryAccountConfigNode, state),
    ...getAccountOrOuVpcNodes(workloadAccountConfigNode, state),
  ];
}

function getAccountOrOuVpcNodes(node: TypeTreeNode, state: any): TypeTreeNode<typeof c.VpcConfigType>[] {
  return Object.keys(node.get(state) ?? {}).flatMap(accountKey => {
    // prettier-ignore
    const vpcArrayNode = node.nested(accountKey).nested<typeof c.VpcConfigType>('vpc');
    const vpcArray = vpcArrayNode.get(state) ?? [];
    return Object.keys(vpcArray).map(key => vpcArrayNode.nested(key));
  });
}
