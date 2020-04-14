import * as aws from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { ProductAVMParam, ServiceCatalog } from './service-catalog';
import { STS } from './sts';

export interface CreateAccountInput {
  avmPortfolioName: string;
  avmProductName: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
}

export type CreateAccountOutputStatus = 'SUCCESS' | 'FAILURE' | 'ALREADY_EXISTS' | 'NOT_RELEVANT';

export interface CreateAccountOutput {
  status?: CreateAccountOutputStatus;
  statusReason?: string;
  provisionedProductStatus?: string;
  provisionToken?: string;
}

export type AccountAvailableStatus = 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';

export interface AccountAvailableOutput {
  status?: AccountAvailableStatus;
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
    const { avmPortfolioName, avmProductName, accountName, emailAddress, organizationalUnit } = input;

    // find service catalog portfolioId by name
    const portfolio = await this.client.findPortfolioByName(avmPortfolioName);
    const portfolioId = portfolio?.Id;
    if (!portfolioId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog portfolio with name "${avmPortfolioName}".`,
      };
    }

    // TODO Add a exponential backoff here
    // find service catalog ProductId by name
    const searchProductsOutput = await this.client.findProduct(avmProductName);
    const productId = searchProductsOutput?.ProductViewSummaries?.[0]?.ProductId;
    if (!productId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog product with name "${avmProductName}".`,
      };
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const listProvisioningArtifactsOutput = await this.client.findProvisioningArtifact(productId);
    const provisioningArtifactId = listProvisioningArtifactsOutput?.ProvisioningArtifactDetails?.[0].Id;
    if (!provisioningArtifactId) {
      return {
        status: 'FAILURE',
        statusReason: `Unable to find service catalog product provisioning artifact for product "${productId}".`,
      };
    }

    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName,
      accountEmail: emailAddress,
      orgUnitName: organizationalUnit,
    };

    const provisionToken = uuidv4();

    // launch AVM Product
    let provisionProductOutput;
    try {
      provisionProductOutput = await this.client.launchProductAVM(
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

    const provisionedProductStatus = provisionProductOutput?.RecordDetail?.Status;
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
   */
  async isAccountAvailable(accountName: string): Promise<AccountAvailableOutput> {
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
        status: 'IN_PROGRESS',
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
