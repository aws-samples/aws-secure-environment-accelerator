import aws from 'aws-sdk';
import org from 'aws-sdk/clients/organizations';
import { listWithNextToken, listWithNextTokenGenerator } from './next-token';
import { ServiceCatalog, ProductAVMParam } from './service-catalog';
import { SecretsManager } from './secrets-manager';
import { v4 as uuidv4 } from 'uuid';

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!!;
const ACCELERATOR_PREFIX = process.env.ACCELERATOR_PREFIX!!;
const ACCELERATOR_SECRET_NAME = process.env.ACCELERATOR_SECRET_NAME!!;

const avmName = 'AWS-Landing-Zone-Account-Vending-Machine';

const credentials = new aws.Credentials('AKIAYZMN46YTVSAZ5UPB', '5v6AAfj0cBJPQ1TemTfEDL7P7WFvV6FxEi8Ktuxt', '');

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Organizations {
  private readonly client: aws.Organizations;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Organizations({
      credentials,
    });
  }

  async getPolicy(input: org.ListPoliciesRequest & { Name: string }): Promise<org.PolicySummary | undefined> {
    const name = input.Name;
    delete input.Name;

    const policies = await listWithNextTokenGenerator<org.ListPoliciesRequest,
      org.ListPoliciesResponse,
      org.PolicySummary>(this.client.listPolicies.bind(this.client), r => r.Policies!!, input);
    for await (const policy of policies) {
      if (policy.Name === name) {
        return policy;
      }
    }
    return undefined;
  }

  async listAccounts(): Promise<org.Account[]> {
    return listWithNextToken<org.ListAccountsRequest,
      org.ListAccountsResponse,
      org.Account>(this.client.listAccounts.bind(this.client), r => r.Accounts!!, {});
  }

  async listPolicies(input: org.ListPoliciesRequest): Promise<org.PolicySummary[]> {
    return listWithNextToken<org.ListPoliciesRequest,
      org.ListPoliciesResponse,
      org.PolicySummary>(this.client.listPolicies.bind(this.client), r => r.Policies!!, input);
  }

  async createPolicy(input: org.CreatePolicyRequest): Promise<org.CreatePolicyResponse> {
    return this.client.createPolicy(input).promise();
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
        statusCode: 200,
        body: 'Unable to find service catalog product with name ' + avmName + '.'
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
        statusCode: 200,
        body: 'Unable to find service catalog product provisioning artifact id for product id' + avmName + '.'
      };
      console.log(response);
      return response;
    }

    // const secrets = new SecretsManager();
    // const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_NAME);
    // const config = JSON.parse(configSecret.SecretString!!) as AcceleratorConfig; // TODO Use a library like io-ts to parse the configuration file

    // config[]

    // prepare param for AVM product launch
    const productAVMParam: ProductAVMParam = {
      accountName: 'shared-network-21',
      accountEmail: 'manishri+shared-network-21@amazon.com',
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

    if (typeof provisionedProductStatus === 'undefined' || provisionedProductStatus != 'CREATED') {
      const response = {
        statusCode: 200,
        provisionedProductStatus: provisionedProductStatus,
        provisionToken: provisionToken,
        body: 'Unable to create ' + accountName + ' account using Account Vending Machine!'
      };
      console.log(response);
      return response;
    }
  }

  /**
   * Is the account created using account-vending-machine available now?
   * @param provisionToken
   * @param accountName
   */
  async isAccountAvailable(provisionToken: string, accountName: string): Promise<any> {
    const servicecatalog = new ServiceCatalog();

    var provisionedProductStatus = null;

    do {
      await delay(5000);
      var provisionedProduct = await servicecatalog.searchProvisionedProducts(provisionToken);
      if (provisionedProduct) {
        provisionedProductStatus = provisionedProduct.ProvisionedProducts[0].Status;
        console.log(provisionedProductStatus);
      }
    } while (provisionedProductStatus == 'UNDER_CHANGE');
    console.log(provisionedProductStatus);

    if (provisionedProductStatus == 'AVAILABLE') {
      const response = {
        statusCode: 200,
        body: accountName + ' account created successfully using Account Vending Machine!'
      };
    } else if (provisionedProductStatus == 'ERROR') {
      const response = {
        statusCode: 200,
        body: 'Unable to create ' + accountName + ' account using Account Vending Machine!'
      };
      console.log(response);
      return response;
    }
  }
}
