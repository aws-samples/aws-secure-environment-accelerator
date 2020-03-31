import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class VPC extends cdk.Construct{
  readonly vpc: string;
  readonly subets = new Map<string, string[]>();
  constructor(parent: cdk.Construct, name: string, props: any){
    super(parent, name)
    let vpcName = props.name;
    let igw, igw_attach, vgw, vgw_attach;
    // Create Custom VPC using CFN Cunstruct as tags overide option not available in default Cunstruct
    let vpcObj = new ec2.CfnVPC(this, vpcName , {
      cidrBlock: props.cidr
    });

    if (props["igw"]){ // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${vpcName}_igw`);
      // Attach IGW to VPC
      igw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_igw`, {
        vpcId: vpcObj.ref,
        internetGatewayId: igw.ref
      });
    }

    if ("vgw" in props && props["vgw"]){ // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.name}_vgw`, {
        type: "ipsec.1"
      });
      // Attach VGW to VPC
      vgw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_vgw`, {
        vpcId: vpcObj.ref,
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
          vpcId: vpcObj.ref
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
        let subnetAzs:string[] = [];
        for( let j=1; j <= props.azs.count; j++){
          let subnetName = `${vpcName}_${props.subnets[i].name}_az${j}_net`;
          let subnet = new ec2.CfnSubnet(this, subnetName, {
            cidrBlock: (props.subnets[i] as any)[`az${j}`].cidr,
            vpcId: vpcObj.ref,
            availabilityZone: `${props.region}-${props.azs['az'+j]}`
          });
          subnetAzs.push(subnet.ref);
          
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
        this.subets.set(props.subnets[i].name, subnetAzs);
      }
    }
    this.vpc = vpcObj.ref;
  }
}