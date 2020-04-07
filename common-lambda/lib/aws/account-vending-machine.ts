import * as aws from 'aws-sdk';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { AcceleratorConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { STS } from './sts';

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';
const portfolioName = 'AWS Landing Zone - Baseline';

export interface CreateAccountInput {
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  lambdaRoleArn: string;
}

export type CreateAccountOutputStatus = 'SUCCESS' | 'FAILURE' | 'ALREADY_EXISTS' | 'NOT_RELEVANT';

export interface CreateAccountOutput {
  status?: CreateAccountOutputStatus;
  statusReason?: string;
  provisionedProductStatus?: string;
  provisionToken?: string;
}

export class AccountVendingMachine {
  private readonly client: ServiceCatalog;
  private readonly sts: STS;

  public constructor(credentials?: aws.Credentials) {
    this.client = new ServiceCatalog(credentials);
    this.sts = new STS(credentials);
  }

  /**
   * Create account using account-vending-machine
   */
  async createAccount(input: CreateAccountInput): Promise<CreateAccountOutput> {
    const { accountName, emailAddress, organizationalUnit, lambdaRoleArn } = input;

    // find service catalog portfolioId by name
    const ListPortfoliosOutput = await this.client.listPortfolios();

    const portfolioDetails = ListPortfoliosOutput?.PortfolioDetails?.find((p) => p.DisplayName === portfolioName);
    const portfolioId = portfolioDetails?.Id;
    console.log('portfolioId: ' + portfolioId);

    if (!portfolioId) {
      return {
        status: 'FAILURE',
        statusReason: 'Unable to find service catalog portfolioId for portfolio - ' + portfolioName + '.',
      };
    }

    // associate principal with portfolio
    const AssociatePrincipalWithPortfolioOutput = await this.client.associateRoleWithPortfolio(
      portfolioId,
      lambdaRoleArn,
    );
    console.log('associate principal with portfolio - response: ', AssociatePrincipalWithPortfolioOutput);

    // TODO Add a exponential backoff here
    // find service catalog ProductId by name
    const SearchProductsOutput = await this.client.findProduct(avmName);

    const productId = SearchProductsOutput?.ProductViewSummaries?.[0]?.ProductId;
    console.log('productId: ' + productId);

    if (!productId) {
      return {
        status: 'FAILURE',
        statusReason: 'Unable to find service catalog product with name ' + avmName + '.',
      };
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const ListProvisioningArtifactsOutput = await this.client.findProvisioningArtifact(productId);
    const provisioningArtifactId = ListProvisioningArtifactsOutput?.ProvisioningArtifactDetails?.[0].Id;
    if (!provisioningArtifactId) {
      return {
        status: 'FAILURE',
        statusReason: 'Unable to find service catalog product provisioning artifact id for product id' + avmName + '.',
      };
    }

    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName,
      accountEmail: emailAddress,
      orgUnitName: organizationalUnit,
    };

    const provisionToken = uuidv4();
    console.log('provisionToken: ' + provisionToken);

    // launch AVM Product
    let ProvisionProductOutput;
    try {
      ProvisionProductOutput = await this.client.launchProductAVM(
        productId,
        provisionToken,
        provisioningArtifactId,
        productAVMParam,
      );
    } catch (e) {
      console.log('Exception Message: ' + e.message);
      if (e.message === 'A stack named ' + accountName + ' already exists.') {
        return {
          status: 'ALREADY_EXISTS',
          statusReason: accountName + ' account already exists!',
          provisionedProductStatus: 'ALREADY_EXISTS',
        };
      }
      throw e;
    }

    const provisionedProductStatus = ProvisionProductOutput?.RecordDetail?.Status;
    if (provisionedProductStatus !== 'CREATED') {
      return {
        status: 'FAILURE',
        statusReason: 'Unable to create ' + accountName + ' account using Account Vending Machine!',
        provisionedProductStatus,
        provisionToken,
      };
    }
    return {
      status: 'SUCCESS',
      statusReason: accountName + ' account created successfully using Account Vending Machine!',
      provisionedProductStatus,
      provisionToken,
    };
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param accountName
   * @param provisionToken
   */
  async isAccountAvailable(accountName: string, provisionToken: string): Promise<CreateAccountOutput> {
    const SearchProvisionedProductsOutput = await this.client.searchProvisionedProducts(accountName);
    const provisionedProductStatus = SearchProvisionedProductsOutput?.ProvisionedProducts?.[0].Status;

    if (provisionedProductStatus === 'AVAILABLE') {
      return {
        status: 'SUCCESS',
        statusReason: accountName + ' account created successfully using Account Vending Machine!',
        provisionedProductStatus,
      };
    } else if (provisionedProductStatus === 'UNDER_CHANGE') {
      return {
        status: 'SUCCESS',
        statusReason: accountName + ' account is being created using Account Vending Machine!',
        provisionedProductStatus,
      };
    }
    return {
      status: 'FAILURE',
      statusReason: 'Unable to create ' + accountName + ' account using Account Vending Machine!',
      provisionedProductStatus,
    };
  }
}
