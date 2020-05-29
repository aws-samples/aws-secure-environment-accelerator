# EC2 Keypair generation

This is a custom resource to generate a Keypair.

## Usage

    import { Keypair } from '@custom-resources/ec2-keypair';

    new Keypair(scope, `Keypair`, {
      name: 'MyKeypair',
    });
