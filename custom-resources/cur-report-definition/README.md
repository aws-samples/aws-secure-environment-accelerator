# Cost and Budget Report Definition

This is a custom resource to that represents a cost and budget report.

## Usage

    import { CurReportDefinition } from '@custom-resources/cur-report-definition';

    new CurReportDefinition(scope, 'CurReportDefinition', {
      additionalArtifacts: ...,
      additionalSchemaElements: ...,
      bucket: ...,
      bucketPrefix: ...,
      bucketRegion: ...,
      compression: ...,
      format: ...,
      refreshClosedReports: ...,
      reportName: ...,
      reportVersioning: ...,
      roleName: ...,
      timeUnit: ...,
    });
