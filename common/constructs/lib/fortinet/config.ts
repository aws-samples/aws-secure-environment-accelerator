import * as fs from 'fs';
import * as tempy from 'tempy';
import * as cdk from '@aws-cdk/core';
import * as s3assets from '@aws-cdk/aws-s3-assets';

export interface FortiGateConfigParameters {
  Hostname: string;
  VPCCIDR: string;
  [key: string]: string;
}

export interface FortiGateConfigProps {
  parameters: FortiGateConfigParameters;
}

export class FortiGateConfig extends cdk.Construct {
  private readonly config: s3assets.Asset;

  constructor(scope: cdk.Construct, id: string, props: FortiGateConfigProps) {
    super(scope, id);

    const { parameters } = props;

    // TODO Download license file and put it in an S3 asset

    // Create a temporary file where we write the generated configuration file
    const configPath = tempy.file({
      extension: 'txt',
    });
    fs.writeFileSync(
      configPath,
      `
config system global
set hostname ${parameters.Hostname}
set admintimeout 60
set vdom-mode split-vdom
end
config system settings
set allow-subnet-overlap enable
end
config global
config system interface
edit port1
set vdom FG-traffic
set alias public
set mode static
set ip ${parameters.Port1IP}
set allowaccess ping https ssh fgfm
set secondary-IP enable
set mtu-override enable
set mtu 9001
next
edit port2
set vdom FG-traffic
set alias private
set mode static
set ip ${parameters.Port2IP}
set allowaccess ping
set mtu-override enable
set mtu 9001
next
edit port3
set vdom root
set alias mgmt
set mode static
set ip ${parameters.Port3IP}
set allowaccess ping https ssh fgfm
set mtu-override enable
set mtu 9001
next
edit port4
set vdom FG-traffic
set alias DMZ
set mode static
set ip ${parameters.Port4IP}
set allowaccess ping
set mtu-override enable
set mtu 9001
next
end
end
config vdom
edit FG-traffic
config router static
edit 1
set device port1
set gateway ${parameters.Port1RouterIP}
next
edit 2
set dst ${parameters.VPCCIDR}
set device port2
set gateway ${parameters.Port2RouterIP}
next
end
next
edit root
config router static
edit 1
set device port3
set gateway ${parameters.Port3RouterIP}
next
end
end`,
    );

    this.config = new s3assets.Asset(this, 'Config', {
      path: configPath,
    });
  }

  get bucketRegion(): string {
    const stack = cdk.Stack.of(this);
    return stack.region;
  }

  get bucketArn(): string {
    return this.config.bucket.bucketArn;
  }

  get configPath(): string {
    return this.config.assetPath;
  }

  get licensePath(): string | undefined {
    return undefined;
  }
}
