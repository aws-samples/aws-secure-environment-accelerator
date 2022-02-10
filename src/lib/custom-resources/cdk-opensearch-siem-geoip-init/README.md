# Put S3 Bucket Notifications

This is a custom resource configure OpenSearch for SIEM.

## Usage

    import { OpenSearchSiemGeoIpInit } from '@aws-accelerator/custom-resource-opensearch-siem-geoip-init';

   
  const openSearchGeoIpInit = new OpenSearchSiemGeoIpInit(accountStack, `${acceleratorPrefix}OpenSearchGeoIpInit`, {
    
  });

