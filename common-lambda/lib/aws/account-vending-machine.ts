import * as aws from 'aws-sdk';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { AcceleratorConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!!;
const ACCELERATOR_PREFIX = process.env.ACCELERATOR_PREFIX!!;
const ACCELERATOR_SECRET_NAME = process.env.ACCELERATOR_SECRET_NAME!!;

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';
const portfolioName = 'AWS Landing Zone - Baseline';

export class AccountVendingMachine {
  private readonly client: ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new ServiceCatalog(credentials);
  }

  /**
   * Create account using account-vending-machine
   * @param accountName
   */
  async createAccount(accountName: string, principalArn: string): Promise<any> {
    console.log('accountName: ' + accountName);
    console.log('principalArn: ' + principalArn);
    console.log('productName: ' + avmName);
    console.log('portfolioName: ' + portfolioName);

    // find service catalog portfolioId by name
    const portfolios = await this.client.listPortfolios();

    let portfolioId = null;
    if (portfolios) {
      for (let index = 0; index < portfolios!.PortfolioDetails!.length; index++) {
        if (portfolios.PortfolioDetails![index].DisplayName == portfolioName) {
          portfolioId = portfolios.PortfolioDetails![index].Id;
        }
      }
    }
    console.log('portfolioId: ' + portfolioId);

    //associate principal with portfolio
    const response = await this.client.associateRoleWithPortfolio(portfolioId, principalArn);
    console.log('associate principal with portfolio - response: ', response);

    // find service catalog ProductId by name
    const product = await this.client.findProduct(avmName);

    let productId = null;
    if (product) {
      productId = product!.ProductViewSummaries![0].ProductId;
    }
    console.log('productId: ' + productId);

    if (productId == null || typeof productId === 'undefined') {
      const response = {
        status: 'FAILURE',
        statusReaason: 'Unable to find service catalog product with name ' + avmName + '.'
      };
      console.log(response);
      return response;
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    const provisioningArtifact = await this.client.findProvisioningArtifact(productId);

    let provisioningArtifactId = null;
    if (provisioningArtifact) {
      provisioningArtifactId = provisioningArtifact!.ProvisioningArtifactDetails![0].Id;
      console.log('provisioningArtifactId: ' + provisioningArtifactId);
    }

    if (provisioningArtifactId == null || typeof provisioningArtifactId === 'undefined') {
      const response = {
        status: 'FAILURE',
        statusReaason: 'Unable to find service catalog product provisioning artifact id for product id' + avmName + '.'
      };
      console.log(response);
      return response;
    }

    // const secrets = new SecretsManager();
    // const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_NAME);
    // const config = JSON.parse(configSecret.SecretString!!) as AcceleratorConfig; // TODO Use a library like io-ts to parse the configuration file

    // TODO: Load from config
    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName: 'SharedNetwork',
      accountEmail: 'manishri+lz-shared-network@amazon.com',
      orgUnitName: 'core',
    };

    const provisionToken = uuidv4();
    console.log('provisionToken: ' + provisionToken);

    // launch AVM Product
    let provisionedProduct = null;
    try {
      provisionedProduct = await this.client.launchProductAVM(productId, provisionToken, provisioningArtifactId, productAVMParam);
    } catch (e) {
      console.log("Exception Message: " + e.message);
      if (e.message == 'A stack named ' + accountName + ' already exists.') {
        const response = {
          status: 'SUCCESS',
          provisionedProductStatus: 'ALREADY_EXISTS',
          provisionToken: '',
          statusReaason: accountName + ' account already exists!'
        }
        return response;
      } else {
        throw e;
      }
    }

    let provisionedProductStatus = null;
    if (provisionedProduct) {
      provisionedProductStatus = provisionedProduct!.RecordDetail!.Status;
      console.log(provisionedProductStatus);
    }

    if (provisionedProductStatus == null || typeof provisionedProductStatus === 'undefined' || provisionedProductStatus != 'CREATED') {
      const response = {
        status: 'FAILURE',
        provisionedProductStatus: provisionedProductStatus,
        provisionToken: provisionToken,
        statusReaason: 'Unable to create ' + accountName + ' account using Account Vending Machine!'
      }
      console.log(response);
      return response;
    } else if (provisionedProductStatus == 'CREATED') {
      const response = {
        status: 'SUCCESS',
        provisionedProductStatus: provisionedProductStatus,
        provisionToken: provisionToken,
        statusReaason: accountName + ' account created successfully using Account Vending Machine!'
      }
      console.log(response);
      return response;
    }
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param accountName
   * @param provisionToken
   */
  async isAccountAvailable(accountName: string, provisionToken: string): Promise<any> {
    let provisionedProductStatus = null;
    const provisionedProduct = await this.client.searchProvisionedProducts(accountName);
    if (provisionedProduct) {
      provisionedProductStatus = provisionedProduct.ProvisionedProducts[0].Status;
      console.log(provisionedProductStatus);
    }

    let response = null;
    if (provisionedProductStatus == 'AVAILABLE') {
      response = {
        status: provisionedProductStatus,
        statusReason: accountName + ' account created successfully using Account Vending Machine!'
      };
    } else if (provisionedProductStatus == 'UNDER_CHANGE') {
      response = {
        status: provisionedProductStatus,
        statusReason: accountName + ' account is being created using Account Vending Machine!'
      };
    } else if (provisionedProduct == null || typeof provisionedProduct === 'undefined' || provisionedProductStatus == 'ERROR') {
      response = {
        status: 'ERROR',
        statusReason: 'Unable to create ' + accountName + ' account using Account Vending Machine!'
      };
    }
    return response;
  }
}
