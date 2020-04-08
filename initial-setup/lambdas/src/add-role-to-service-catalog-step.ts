import { ServiceCatalog } from '@aws-pbmm/common-lambda/lib/aws/service-catalog';

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
  const principal = listPrincipalsForPortfolio.Principals?.find(p => p.PrincipalARN === roleArn);
  if (principal) {
    return {
      status: 'SUCCESS',
      statusReason: `Not associating role ${roleArn} as it is already associated to portfolio "${portfolioName}"`
    }
  }

  await catalog.associateRoleWithPortfolio(portfolioId, roleArn);

  return {
    status: 'SUCCESS',
    statusReason: `Associated role ${roleArn} with portfolio "${portfolioName}"`
  }
};
