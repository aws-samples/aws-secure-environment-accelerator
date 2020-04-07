import * as aws from 'aws-sdk';
import {
  ListPortfoliosOutput,
  AssociatePrincipalWithPortfolioInput,
  AssociatePrincipalWithPortfolioOutput,
  SearchProductsInput,
  SearchProductsOutput,
  ListProvisioningArtifactsInput,
  ListProvisioningArtifactsOutput,
  ProvisionProductInput,
  ProvisionProductOutput,
  SearchProvisionedProductsInput,
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
    return this.client.listPortfolios().promise();
  }

  /**
   * Associate Role with service catalog Portfolio
   * @param portfolioId
   * @param principalArn
   */
  async associateRoleWithPortfolio(
    portfolioId: string,
    principalArn: string,
  ): Promise<AssociatePrincipalWithPortfolioOutput> {
    const associatePrincipalWithPortfolioInput: AssociatePrincipalWithPortfolioInput = {
      PortfolioId: portfolioId,
      PrincipalARN: principalArn,
      PrincipalType: 'IAM',
    };

    return this.client.associatePrincipalWithPortfolio(associatePrincipalWithPortfolioInput).promise();
  }

  /**
   * Find service catalog product by name
   * @param productName
   */
  async findProduct(productName: string): Promise<SearchProductsOutput> {
    const searchProductsInput: SearchProductsInput = {
      Filters: {
        FullTextSearch: [productName],
      },
    };

    return this.client.searchProducts(searchProductsInput).promise();
  }

  /**
   * Find service catalog provisioningArtifact by productId
   * @param productId
   */
  async findProvisioningArtifact(productId: string): Promise<ListProvisioningArtifactsOutput> {
    const listProvisioningArtifactsInput: ListProvisioningArtifactsInput = {
      ProductId: productId,
    };

    return this.client.listProvisioningArtifacts(listProvisioningArtifactsInput).promise();
  }

  /**
   * Launch Product AVM by ProductId, ProvisioningArtifactId, and ProvisioningParameters
   * @param productId
   * @param provisionToken
   * @param provisioningArtifactId
   * @param productAVMParam
   */
  async launchProductAVM(
    productId: string,
    provisionToken: string,
    provisioningArtifactId: string,
    productAVMParam: ProductAVMParam,
  ): Promise<ProvisionProductOutput> {
    const provisionProductInput: ProvisionProductInput = {
      ProductId: productId /* required */,
      ProvisionToken: provisionToken /* required */,
      ProvisionedProductName: productAVMParam.accountName /* required */,
      ProvisioningArtifactId: provisioningArtifactId /* required */,
      ProvisioningParameters: [
        {
          Key: 'AccountName',
          Value: productAVMParam.accountName,
        },
        {
          Key: 'AccountEmail',
          Value: productAVMParam.accountEmail,
        },
        {
          Key: 'OrgUnitName',
          Value: productAVMParam.orgUnitName,
        },
        {
          Key: 'VPCOptions',
          Value: 'No-Primary-VPC' /* CA PBMM requirement. Please do not alter. */,
        },
        {
          Key: 'VPCRegion',
          Value: 'ca-central-1' /* CA PBMM requirement. Please do not alter. */,
        },
        {
          Key: 'VPCCidr',
          Value: '10.0.0.0/16' /* CA PBMM requirement. Please do not alter. */,
        },
        {
          Key: 'PeerVPC',
          Value: 'false' /* CA PBMM requirement. Please do not alter. */,
        },
      ],
      Tags: [
        {
          Key: 'Accelerator' /* required */,
          Value: 'PBMM' /* required */,
        },
      ],
    };

    return this.client.provisionProduct(provisionProductInput).promise();
  }

  /**
   * Search provisioned products to check status of newly provisioned product
   * @param accountName
   */
  async searchProvisionedProducts(accountName: string): Promise<SearchProvisionedProductsOutput> {
    const searchProvisionedProductsInput: SearchProvisionedProductsInput = {
      Filters: {
        SearchQuery: ['name:' + accountName],
      },
    };

    return this.client.searchProvisionedProducts(searchProvisionedProductsInput).promise();
  }
}
