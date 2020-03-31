import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class VPC extends cdk.Construct{
  readonly vpc: ec2.CfnVPC;
  constructor(parent: cdk.Construct, name: string, props: any){
    super(parent, name)
    let vpcName = props.name;
    let igw, igw_attach, vgw, vgw_attach;
    // Create Custom VPC using CFN Cunstruct as tags overide option not available in default Cunstruct
    this.vpc = new ec2.CfnVPC(this, vpcName , {
      cidrBlock: props.cidr
    });

    new cdk.CfnOutput(this, 'vpcId', {
      value: this.vpc.ref,
      exportName: 'ExportedVpcId'
    });

    if (props["igw"]){ // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${vpcName}_igw`);
      // Attach IGW to VPC
      igw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_igw`, {
        vpcId: this.vpc.ref,
        internetGatewayId: igw.ref
      });
    }

    if ("vgw" in props && props["vgw"].create === "Yes"){ // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.name}_vgw`, {
        type: "ipsec.1"
      });
      // Attach VGW to VPC
      vgw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_vgw`, {
        vpcId: this.vpc.ref,
        vpnGatewayId: vgw.ref
      });
    }

    let routeTables = new Map();
    
    if("route-tables" in props){ // Create Route Tables
      const routeTablesProps  = props['route-tables'];
      for(let count=0; count < routeTablesProps.length; count++){
        if ( routeTablesProps[count].name === "default"){
          continue;
        }
        let routeTableName = routeTablesProps[count].name;
        let routeTable = new ec2.CfnRouteTable(this, routeTableName, {
          vpcId: this.vpc.ref
        });
        routeTables.set(routeTableName, routeTable);
        // Add Routes to RouteTable
        for( let route of routeTablesProps[count].routes){
          let params:any = {
            routeTableId: routeTable.ref,
            destinationCidrBlock: route.destination
          }
          let dependsOn:any;
          if(route.target === "IGW"){
            params["gatewayId"] = igw? igw.ref: null;
            if(igw_attach){dependsOn = igw_attach;}
          }
          else if(route.target === "VGW"){
            params['gatewayId'] = vgw? vgw.ref: null;
            if(vgw_attach){dependsOn = vgw_attach;}
              
          }
          else{
            // Need to add for different Routes
            continue
          }
          if(dependsOn){
            new ec2.CfnRoute(this, `${routeTableName}_${route.target}`, params).addDependsOn(dependsOn);
          }
          else{
            new ec2.CfnRoute(this, `${routeTableName}_${route.target}`, params);
          }
        }
      }
    }

    if ("azs" in props){ // Create Subnets
      for (let i=0; i < props.subnets.length; i++){
        for( let j=1; j <= props.azs.count; j++){
          var subnetName = `${props.name}_${props.subnets[i].name}_az${j}_net`;
          let subnetName = `${vpcName}_${props.subnets[i].name}_az${j}_net`;
          console.log(subnetName);
          let subnet = new ec2.CfnSubnet(this, subnetName, {
            cidrBlock: (props.subnets[i] as any)[`az${j}`].cidr,
            vpcId: this.vpc.ref,
            availabilityZone: `${props.region}-${props.azs['az'+j]}`
          });
          
          // Attach Subnet to Route-Table
          let routeTableName:string = (props.subnets[i] as any)[`az${j}`]['route-table'];
          if(routeTableName === "default"){
            continue
          }
          new ec2.CfnSubnetRouteTableAssociation(this, `${subnetName}_ ${routeTableName}`, {
            routeTableId: routeTables.get(routeTableName).ref,
            subnetId: subnet.ref
          });
        }
      }
    }
  }
}