import * as aws from 'aws-sdk';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { AcceleratorConfig } from '../config';
import { v4 as uuidv4 } from 'uuid';

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!!;
const ACCELERATOR_PREFIX = process.env.ACCELERATOR_PREFIX!!;
const ACCELERATOR_SECRET_NAME = process.env.ACCELERATOR_SECRET_NAME!!;

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';

export class AccountVendingMachine {
  private readonly client: aws.ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ServiceCatalog({
        credentials,
    });
  }

  /**
   * Create account using account-vending-machine
   * @param accountName
   */
  async createAccount(accountName: string): Promise<any> {
    const servicecatalog = new ServiceCatalog();

    // find service catalog ProductId by name
    var product = await servicecatalog.findProduct(avmName);

    var productId = null;
    if (product) {
      productId = product?.ProductViewSummaries[0]?.ProductId;
      console.log(productId);
    }

    if (productId == null || typeof productId === 'undefined') {
      const response = {
        status: 'FAILURE',
        statusReaason: 'Unable to find service catalog product with name ' + avmName + '.'
      };
      console.log(response);
      return response;
    }

    // find service catalog Product - ProvisioningArtifactId by ProductId
    var provisioningArtifact = await servicecatalog.findProvisioningArtifact(productId);

    var provisioningArtifactId = null;
    if (provisioningArtifact) {
      provisioningArtifactId = provisioningArtifact?.ProvisioningArtifactDetails[0]?.Id;
      console.log(provisioningArtifactId);
    }

    if (provisioningArtifactId == null || typeof provisioningArtifactId === 'undefined') {
      const response = {
        status: 'FAILURE',
        statusReaason: 'Unable to find service catalog product provisioning artifact id for product id' + avmName + '.'
      };
      console.log(response);
      return response;
    }

    const secrets = new SecretsManager();
    const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_NAME);
    const config = JSON.parse(configSecret.SecretString!!) as AcceleratorConfig; // TODO Use a library like io-ts to parse the configuration file

    // TODO: Load from config
    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName: 'SharedNetwork',
      accountEmail: 'manishri+lz-shared-network@amazon.com',
      orgUnitName: 'core',
    };

    const provisionToken = uuidv4();

    // launch AVM Product
    var provisionedProduct = await servicecatalog.launchProductAVM(productId, provisionToken, provisioningArtifactId, productAVMParam);

    var provisionedProductStatus = null;
    if (provisionedProduct) {
      provisionedProductStatus = provisionedProduct?.RecordDetail?.Status;
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
    const servicecatalog = new ServiceCatalog();

    var provisionedProductStatus = null;

    var provisionedProduct = await servicecatalog.searchProvisionedProducts(provisionToken);
    if (provisionedProduct) {
        provisionedProductStatus = provisionedProduct.ProvisionedProducts[0].Status;
        console.log(provisionedProductStatus);
    }

    if (provisionedProductStatus == 'AVAILABLE') {
      const response = {
        status: 'SUCCESS',
        statusReaason: accountName + ' account created successfully using Account Vending Machine!'
      };
    } else if (provisionedProduct == null || typeof provisionedProduct === 'undefined' || provisionedProductStatus == 'ERROR') {
      const response = {
        status: 'FAILURE',
        statusReaason: 'Unable to create ' + accountName + ' account using Account Vending Machine!'
      };
      console.log(response);
      return response;
    }
  }
}
