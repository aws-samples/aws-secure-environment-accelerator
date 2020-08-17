import * as aws from 'aws-sdk';
import {
  AssociatePrincipalWithPortfolioOutput,
  ListPortfoliosOutput,
  ListPrincipalsForPortfolioOutput,
  ListProvisioningArtifactsOutput,
  PortfolioDetail,
  ProvisionProductInput,
  ProvisionProductOutput,
  SearchProductsOutput,
  SearchProvisionedProductsOutput,
} from 'aws-sdk/clients/servicecatalog';

export interface ProductAVMParam {
  accountName: string;
  accountEmail: string;
  orgUnitName: string;
}

export class ServiceCatalog {
  private readonly client: aws.ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ServiceCatalog({
      credentials,
    });
  }

  /**
   * List service catalog portfolios
   */
  async listPortfolios(): Promise<ListPortfoliosOutput> {
    // TODO Support PageToken
    return this.client.listPortfolios().promise();
  }

  async listPrincipalsForPortfolio(portfolioId: string): Promise<ListPrincipalsForPortfolioOutput> {
    // TODO Support PageToken
    return this.client
      .listPrincipalsForPortfolio({
        PortfolioId: portfolioId,
      })
      .promise();
  }

  async findPortfolioByName(portfolioName: string): Promise<PortfolioDetail | undefined> {
    const listPortfolios = await this.listPortfolios();
    return listPortfolios?.PortfolioDetails?.find(p => p.DisplayName === portfolioName);
  }

  /**
   * Associate Role with service catalog Portfolio
   * @param portfolioId
   * @param prinicipalArn
   */
  async associateRoleWithPortfolio(
    portfolioId: string,
    prinicipalArn: string,
  ): Promise<AssociatePrincipalWithPortfolioOutput> {
    return this.client
      .associatePrincipalWithPortfolio({
        PortfolioId: portfolioId,
        PrincipalARN: prinicipalArn,
        PrincipalType: 'IAM',
      })
      .promise();
  }

  /**
   * Find service catalog product by name
   * @param productName
   */
  async findProduct(productName: string): Promise<SearchProductsOutput> {
    return this.client
      .searchProducts({
        Filters: {
          FullTextSearch: [productName],
        },
      })
      .promise();
  }

  /**
   * Find service catalog provisioningArtifact by productId
   * @param productId
   */
  async findProvisioningArtifact(productId: string): Promise<ListProvisioningArtifactsOutput> {
    return this.client
      .listProvisioningArtifacts({
        ProductId: productId,
      })
      .promise();
  }

  async provisionProduct(input: ProvisionProductInput): Promise<ProvisionProductOutput> {
    return this.client
      .provisionProduct({
        ...input,
        Tags: [
          ...(input.Tags || []),
          {
            Key: 'Accelerator',
            Value: 'PBMM',
          },
        ],
      })
      .promise();
  }

  /**
   * Search provisioned products to check status of newly provisioned product
   * @param accountName
   */
  async searchProvisionedProducts(accountName: string): Promise<SearchProvisionedProductsOutput> {
    return this.client
      .searchProvisionedProducts({
        Filters: {
          SearchQuery: ['name:' + accountName],
        },
      })
      .promise();
  }
}
