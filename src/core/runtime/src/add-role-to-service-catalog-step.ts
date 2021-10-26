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

import { ServiceCatalog } from '@aws-accelerator/common/src/aws/service-catalog';

interface AddRoleToServiceCatalog {
  roleArn: string;
  portfolioName: string;
}

export const handler = async (input: AddRoleToServiceCatalog) => {
  console.log(`Adding role to service catalog...`);
  console.log(JSON.stringify(input, null, 2));

  const { roleArn, portfolioName } = input;

  const catalog = new ServiceCatalog();

  const portfolio = await catalog.findPortfolioByName(portfolioName);
  const portfolioId = portfolio?.Id;
  if (!portfolioId) {
    return {
      status: 'FAILURE',
      statusReason: `Unable to find service catalog portfolio with name "${portfolioName}"`,
    };
  }

  const listPrincipalsForPortfolio = await catalog.listPrincipalsForPortfolio(portfolioId);

  // Check if the role is already there, otherwise we associate it to the portfolio
  const principal = listPrincipalsForPortfolio?.find(p => p.PrincipalARN === roleArn);
  if (principal) {
    return {
      status: 'SUCCESS',
      statusReason: `Not associating role ${roleArn} as it is already associated to portfolio "${portfolioName}"`,
    };
  }

  await catalog.associateRoleWithPortfolio(portfolioId, roleArn);

  return {
    status: 'SUCCESS',
    statusReason: `Associated role ${roleArn} with portfolio "${portfolioName}"`,
  };
};
