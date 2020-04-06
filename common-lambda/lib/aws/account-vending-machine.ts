import * as aws from 'aws-sdk';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { AcceleratorConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';
const portfolioName = 'AWS Landing Zone - Baseline';

export interface Response {
  status: string;
  statusReason: string;
  provisionedProductStatus: string;
  provisionToken: string;
}

export class AccountVendingMachine {
  private readonly client: ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new ServiceCatalog(credentials);
  }

  /**
   * Create account using account-vending-machine
   * @param accountName
   * @param lambdaRoleArn
   * @param acceleratorConfigSecretArn
   */
  async createAccount(
    accountName: string,
    lambdaRoleArn: string,
    acceleratorConfigSecretArn: string,
  ): Promise<Response | undefined> {
    console.log('accountName: ' + accountName);
    console.log('lambdaRoleArn: ' + lambdaRoleArn);
    console.log('productName: ' + avmName);
    console.log('portfolioName: ' + portfolioName);

    const response: Response = {
      status: '',
      statusReason: '',
      provisionedProductStatus: '',
      provisionToken: '',
    };

    // find service catalog portfolioId by name
    const ListPortfoliosOutput = await this.client.listPortfolios();

    let portfolioId = null;
    if (ListPortfoliosOutput) {
      for (let index = 0; index < ListPortfoliosOutput!.PortfolioDetails!.length; index++) {
        if (ListPortfoliosOutput.PortfolioDetails![index].DisplayName === portfolioName) {
          portfolioId = ListPortfoliosOutput.PortfolioDetails![index].Id;
        }
      }
    }
    console.log('portfolioId: ' + portfolioId);

    if (portfolioId == null) {
      response.status = 'FAILURE';
      response.statusReason = 'Unable to find service catalog portfolioId for portfolio - ' + portfolioName + '.';
      return response;
    }

    // associate principal with portfolio
    const AssociatePrincipalWithPortfolioOutput = await this.client.associateRoleWithPortfolio(
      portfolioId == null ? '' : portfolioId,
      lambdaRoleArn,
    );
    console.log('associate principal with portfolio - response: ', AssociatePrincipalWithPortfolioOutput);

    // find service catalog ProductId by name
    const SearchProductsOutput = await this.client.findProduct(avmName);

    let productId = null;
    if (SearchProductsOutput) {
      productId = SearchProductsOutput!.ProductViewSummaries![0].ProductId;
    }
    console.log('productId: ' + productId);

    if (productId == null || typeof productId === 'undefined') {
      response.status = 'FAILURE';
      response.statusReason = 'Unable to find service catalog product with name ' + avmName + '.';
      console.log(response);
      return response;
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const ListProvisioningArtifactsOutput = await this.client.findProvisioningArtifact(productId);

    let provisioningArtifactId = null;
    if (ListProvisioningArtifactsOutput) {
      provisioningArtifactId = ListProvisioningArtifactsOutput!.ProvisioningArtifactDetails![0].Id;
      console.log('provisioningArtifactId: ' + provisioningArtifactId);
    }

    if (provisioningArtifactId == null || typeof provisioningArtifactId === 'undefined') {
      response.status = 'FAILURE';
      response.statusReason =
        'Unable to find service catalog product provisioning artifact id for product id' + avmName + '.';
      console.log(response);
      return response;
    }

    // fetch config from secret-manager
    const secrets = new SecretsManager();
    const configSecret = await secrets.getSecret(acceleratorConfigSecretArn);
    const config = JSON.parse(configSecret.SecretString!!) as AcceleratorConfig; // TODO Use a library like io-ts to parse the configuration file

    let configAccountName = null;
    let configAccountEmail: string = '';
    let configOrgUnitName: string = '';
    const mandatoryAccountConfig = config['mandatory-account-configs'];
    let accountConfig = null;
    if (accountName === 'shared-network') {
      accountConfig = mandatoryAccountConfig['shared-network'];
    } else if (accountName === 'perimeter') {
      // TODO: replace shared-network name with perimeter
      accountConfig = mandatoryAccountConfig['shared-network'];
    } else {
      response.status = 'FAILURE';
      response.statusReason = 'Unable to find config properties for the account name - ' + accountName + '.';
      console.log(response);
      return response;
    }

    configAccountName = accountConfig['account-name'];
    configAccountEmail = accountConfig.email;
    configOrgUnitName = accountConfig.ou;

    console.log('config-accountName: ' + configAccountName);
    console.log('config-accountEmail: ' + configAccountEmail);
    console.log('config-OrgUnitName: ' + configOrgUnitName);

    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName: configAccountName,
      accountEmail: configAccountEmail,
      orgUnitName: configOrgUnitName,
    };

    const provisionToken = uuidv4();
    console.log('provisionToken: ' + provisionToken);

    // launch AVM Product
    let ProvisionProductOutput = null;
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
        response.status = 'SUCCESS';
        response.provisionedProductStatus = 'ALREADY_EXISTS';
        response.provisionToken = '';
        response.statusReason = accountName + ' account already exists!';
        return response;
      } else {
        throw e;
      }
    }

    let provisionedProductStatus = null;
    if (ProvisionProductOutput) {
      provisionedProductStatus = ProvisionProductOutput!.RecordDetail!.Status;
      console.log(provisionedProductStatus);
    }

    if (
      provisionedProductStatus == null ||
      typeof provisionedProductStatus === 'undefined' ||
      provisionedProductStatus !== 'CREATED'
    ) {
      response.status = 'FAILURE';
      response.provisionedProductStatus = provisionedProductStatus == null ? '' : provisionedProductStatus;
      response.provisionToken = provisionToken == null ? '' : provisionToken;
      response.statusReason = 'Unable to create ' + accountName + ' account using Account Vending Machine!';
      console.log(response);
      return response;
    } else if (provisionedProductStatus === 'CREATED') {
      response.status = 'SUCCESS';
      response.provisionedProductStatus = provisionedProductStatus == null ? '' : provisionedProductStatus;
      response.provisionToken = provisionToken == null ? '' : provisionToken;
      response.statusReason = accountName + ' account created successfully using Account Vending Machine!';
      console.log(response);
      return response;
    }
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param accountName
   * @param provisionToken
   */
  async isAccountAvailable(accountName: string, provisionToken: string): Promise<Response> {
    let provisionedProductStatus = null;
    const SearchProvisionedProductsOutput = await this.client.searchProvisionedProducts(accountName);
    if (SearchProvisionedProductsOutput) {
      provisionedProductStatus = SearchProvisionedProductsOutput!.ProvisionedProducts![0].Status;
      console.log('provisionedProductStatus: ' + provisionedProductStatus);
    }

    const response: Response = {
      status: '',
      statusReason: '',
      provisionedProductStatus: '',
      provisionToken: '',
    };

    if (provisionedProductStatus === 'AVAILABLE') {
      response.status = provisionedProductStatus;
      response.statusReason = accountName + ' account created successfully using Account Vending Machine!';
    } else if (provisionedProductStatus === 'UNDER_CHANGE') {
      response.status = provisionedProductStatus;
      response.statusReason = accountName + ' account is being created using Account Vending Machine!';
    } else if (
      SearchProvisionedProductsOutput == null ||
      typeof SearchProvisionedProductsOutput === 'undefined' ||
      provisionedProductStatus === 'ERROR'
    ) {
      response.status = 'ERROR';
      response.statusReason = 'Unable to create ' + accountName + ' account using Account Vending Machine!';
    }
    return response;
  }
}
