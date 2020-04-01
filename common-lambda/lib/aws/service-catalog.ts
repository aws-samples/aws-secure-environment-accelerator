import * as aws from 'aws-sdk';
import {
    SearchProductsInput,
    ListProvisioningArtifactsInput,
    ProvisionProductInput,
    SearchProvisionedProductsInput
  } from 'aws-sdk/clients/servicecatalog';

export interface ProductAVMParam {
    accountName: string,
    accountEmail: string,
    orgUnitName: string,
}

export class ServiceCatalog {
private readonly client: aws.ServiceCatalog;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.ServiceCatalog({
        credentials,
    });
  }

  /**
   * Find service catalog product by name
   * @param productName
   */
  async findProduct(productName: string): Promise<any> {
    const searchProductsInput: SearchProductsInput = {
        Filters: {
            FullTextSearch: [productName]
          }
    }

    return this.client.searchProducts(searchProductsInput).promise();
}

  /**
   * Find service catalog provisioningArtifact by productId
   * @param productId 
   */
  async findProvisioningArtifact(productId: string): Promise<any>{
    const listProvisioningArtifactsInput: ListProvisioningArtifactsInput = {
        ProductId: productId
    }

    return this.client.listProvisioningArtifacts(listProvisioningArtifactsInput).promise();
  }

  /**
   * Launch Product AVM by ProductId, ProvisioningArtifactId, and ProvisioningParameters
   * @param productId
   * @param provisionToken 
   * @param provisioningArtifactId
   * @param productAVMParam
   */
  async launchProductAVM(productId: string, provisionToken: string, provisioningArtifactId: string, productAVMParam: ProductAVMParam): Promise<any> {
    const provisionProductInput: ProvisionProductInput = {
        ProductId: productId, /* required */
        ProvisionToken: provisionToken, /* required */
        ProvisionedProductName: productAVMParam.accountName, /* required */
        ProvisioningArtifactId: provisioningArtifactId, /* required */
        ProvisioningParameters: [
            {
                Key: 'AccountName',
                Value: productAVMParam.accountName
            },
            {
                Key: 'AccountEmail',
                Value: productAVMParam.accountEmail
            },
            {
                Key: 'OrgUnitName',
                Value: productAVMParam.orgUnitName
            },
            {
                Key: 'VPCOptions',
                Value: 'No-Primary-VPC' /* CA PBMM requirement. Please do not alter. */
            },
            {
                Key: 'VPCRegion',
                Value: 'ca-central-1' /* CA PBMM requirement. Please do not alter. */
            },
            {
                Key: 'VPCCidr',
                Value: '10.0.0.0/16' /* CA PBMM requirement. Please do not alter. */
            },
            {
                Key: 'PeerVPC',
                Value: 'false' /* CA PBMM requirement. Please do not alter. */
            }
        ],
        Tags: [
            {
            Key: 'Accelerator', /* required */
            Value: 'PBMM' /* required */
            }
        ]
    };

    return this.client.provisionProduct(provisionProductInput).promise();
  }

  /**
   * Search provisioned products to check status of newly provisioned product
   * @param provisionToken
   */
  async searchProvisionedProducts(provisionToken: string): Promise<any>{
    const searchProvisionedProductsInput: SearchProvisionedProductsInput = {
        Filters: {
            SearchQuery: ['idempotencyToken:'+provisionToken]
        } 
    }
    return this.client.searchProvisionedProducts(searchProvisionedProductsInput).promise();
  }
}
