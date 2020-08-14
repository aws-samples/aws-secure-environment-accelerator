# EC2 Keypair generation

This is a custom resource to generate a Keypair.

## Usage

    import { Keypair } from '@aws-accelerator/custom-resource-ec2-keypair';

    const keypair = new Keypair(scope, `Keypair`, {
      name: 'MyKeypair',
      secretPrefix: '/my/prefix/',
    });

    // Use key name to get the private key stored in secret manager
    keypair.keyName();
