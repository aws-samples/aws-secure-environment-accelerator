import * as aws from 'aws-sdk';
import {
  ListPortfoliosOutput,
  AssociatePrincipalWithPortfolioOutput,
  SearchProductsOutput,
  ListProvisioningArtifactsOutput,
  ProvisionProductOutput,
  SearchProvisionedProductsOutput,
} from 'aws-sdk/clients/servicecatalog';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { AcceleratorConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';
const portfolioName = 'AWS Landing Zone - Baseline';

export interface Response {
  status: string;
  statusReason: string;
  provisionedAccountName: string;
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
      provisionedAccountName: '',
      provisionedProductStatus: '',
      provisionToken: '',
    };

    // find service catalog portfolioId by name
    const listPortfoliosOutput: ListPortfoliosOutput = await this.client.listPortfolios();

    let portfolioId = null;
    if (listPortfoliosOutput) {
      for (let index = 0; index < listPortfoliosOutput!.PortfolioDetails!.length; index++) {
        if (listPortfoliosOutput.PortfolioDetails![index].DisplayName === portfolioName) {
          portfolioId = listPortfoliosOutput.PortfolioDetails![index].Id;
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
    const associatePrincipalWithPortfolioOutput: AssociatePrincipalWithPortfolioOutput = await this.client.associateRoleWithPortfolio(
      portfolioId == null ? '' : portfolioId,
      lambdaRoleArn,
    );
    console.log('associate principal with portfolio - response: ', associatePrincipalWithPortfolioOutput);

    // find service catalog ProductId by name
    const searchProductsOutput: SearchProductsOutput = await this.client.findProduct(avmName);

    let productId = null;
    if (searchProductsOutput) {
      productId = searchProductsOutput?.ProductViewSummaries?.[0].ProductId;
    }
    console.log('productId: ' + productId);

    if (!productId) {
      response.status = 'FAILURE';
      response.statusReason = 'Unable to find service catalog product with name ' + avmName + '.';
      console.log(response);
      return response;
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const listProvisioningArtifactsOutput: ListProvisioningArtifactsOutput = await this.client.findProvisioningArtifact(
      productId,
    );

    let provisioningArtifactId = null;
    if (listProvisioningArtifactsOutput) {
      provisioningArtifactId = listProvisioningArtifactsOutput!.ProvisioningArtifactDetails![0].Id;
      console.log('provisioningArtifactId: ' + provisioningArtifactId);
    }

    if (!provisioningArtifactId) {
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
    let provisionProductOutput: ProvisionProductOutput;
    try {
      provisionProductOutput = await this.client.launchProductAVM(
        productId,
        provisionToken,
        provisioningArtifactId,
        productAVMParam,
      );
    } catch (e) {
      const exceptionMessage: string = e.message;
      console.log('Exception Message: ' + exceptionMessage);
      const expectedExceptionMessage: string = 'A stack named ' + configAccountName + ' already exists.';
      console.log('Expected Exception Message: ' + expectedExceptionMessage);
      if (exceptionMessage === expectedExceptionMessage) {
        response.status = 'SUCCESS';
        response.statusReason = accountName + ' account already exists!';
        response.provisionedAccountName = configAccountName;
        response.provisionedProductStatus = 'ALREADY_EXISTS';
        response.provisionToken = '';
        return response;
      } else {
        console.log('Unexpected Exception: ');
        throw e;
      }
    }

    let provisionedProductStatus = null;
    if (provisionProductOutput) {
      provisionedProductStatus = provisionProductOutput!.RecordDetail!.Status;
      console.log(provisionedProductStatus);
    }

    if (
      provisionedProductStatus == null ||
      typeof provisionedProductStatus === 'undefined' ||
      provisionedProductStatus !== 'CREATED'
    ) {
      response.status = 'FAILURE';
      response.statusReason = 'Unable to create ' + accountName + ' account using Account Vending Machine!';
      response.provisionedAccountName = configAccountName;
      response.provisionedProductStatus = provisionedProductStatus == null ? '' : provisionedProductStatus;
      response.provisionToken = provisionToken == null ? '' : provisionToken;
      console.log(response);
      return response;
    } else if (provisionedProductStatus === 'CREATED') {
      response.status = 'SUCCESS';
      response.statusReason = accountName + ' account created successfully using Account Vending Machine!';
      response.provisionedAccountName = configAccountName;
      response.provisionedProductStatus = provisionedProductStatus == null ? '' : provisionedProductStatus;
      response.provisionToken = provisionToken == null ? '' : provisionToken;
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
    const searchProvisionedProductsOutput: SearchProvisionedProductsOutput = await this.client.searchProvisionedProducts(
      accountName,
    );
    if (searchProvisionedProductsOutput) {
      console.log('SearchProvisionedProductsOutput: ' + searchProvisionedProductsOutput);
      provisionedProductStatus = searchProvisionedProductsOutput!.ProvisionedProducts![0].Status;
      console.log('provisionedProductStatus: ' + provisionedProductStatus);
    }

    const response: Response = {
      status: '',
      statusReason: '',
      provisionedAccountName: '',
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
      searchProvisionedProductsOutput == null ||
      typeof searchProvisionedProductsOutput === 'undefined' ||
      provisionedProductStatus === 'ERROR'
    ) {
      response.status = 'ERROR';
      response.statusReason = 'Unable to create ' + accountName + ' account using Account Vending Machine!';
    }
    return response;
  }
}
