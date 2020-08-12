# S3 Template

This is a custom resource that replaces variables in an S3 object and saves a copy with filled-out variables.

## Usage

    import { S3Template } from '@aws-accelerator/custom-resource-s3-template';

    const template = new S3Template(scope, 'Template', {
      templateBucket: ...,
      templatePath: ...,
      outputBucket: ...,
      outputPath: ...,
    });

    template.addReplacement('{{IpAddress}}', '192.168.1.1');
    template.addReplacement('{{NetworkMask}}', '255.255.255.0');
