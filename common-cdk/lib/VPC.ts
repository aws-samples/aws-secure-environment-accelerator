import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class VPC extends cdk.Construct{
  constructor(parent: cdk.Construct, name: string, props: any){
    super(parent, name)
    var vpcName = `${props.name}_vpc`;
    var igw, igw_attach, vgw, vgw_attach;
    // Create Custom VPC using CFN Cunstruct as tags overide option not available in default Cunstruct
    const vpc = new ec2.CfnVPC(this, vpcName , {
      cidrBlock: props.cidr,
      tags:[
        {
          key: 'Name',
          value: vpcName
        }
      ]
    });

    if (props["igw"]){ // Create IGW
      igw = new ec2.CfnInternetGateway(this, `${props.name}_igw`, {
        tags:[
          {
            key: "Name",
            value: `${props.name}_igw`
          }
        ]
      });
      // Attach IGW to VPC
      igw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_igw`, {
        vpcId: vpc.ref,
        internetGatewayId: igw.ref
      });
    }

    if ("vgw" in props && props["vgw"].create == "Yes"){ // Create VGW
      vgw = new ec2.CfnVPNGateway(this, `${props.name}_vgw`, {
        type: "ipsec.1",
        tags:[
          {
            key: "Name",
            value: `${props.name}_vgw`
          }
        ]
      });
      // Attach VGW to VPC
      vgw_attach = new ec2.CfnVPCGatewayAttachment(this, `${props.name}_attach_vgw`, {
        vpcId: vpc.ref,
        vpnGatewayId: vgw.ref
      });
    }

    let routeTables = new Map();
    
    if("route-tables" in props){ // Create Route Tables
      for(let count=0; count < props["route-tables"].length; count++){
        if ( props["route-tables"][count].name == "default"){
          continue;
        }
        var routeTableName = `${props["route-tables"][count].name}_rt`;
        var routeTable = new ec2.CfnRouteTable(this, routeTableName, {
          vpcId: vpc.ref,
          tags:[
            {
              key: "Name",
              value: routeTableName
            }
          ]
        });
        routeTables.set(props["route-tables"][count].name, routeTable);
        // Add Routes to RouteTable
        for( var route of props["route-tables"][count].routes){
          var params:any = {
            routeTableId: routeTable.ref,
            destinationCidrBlock: route.destination
          }
          var dependsOn:any;
          if(route.target == "IGW"){
            params['gatewayId'] = igw? igw.ref: null;
            if(igw_attach){dependsOn = igw_attach;}
          }
          else if(route.target == "VGW"){
            params['gatewayId'] = vgw? vgw.ref: null;
            if(vgw_attach){dependsOn = vgw_attach;}
              
          }
          else{
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
          var subnet = new ec2.CfnSubnet(this, subnetName, {
            cidrBlock: (props.subnets[i] as any)[`az${j}`].cidr,
            vpcId: vpc.ref,
            availabilityZone: `${props.region}-${props.azs['az'+j]}`,
            tags:[
              {
                key: 'Name',
                value: subnetName
              }
            ]
          });
          
          // Attach Subnet to Route-Table
          var routeTableName:string = (props.subnets[i] as any)[`az${j}`]['route-table'];
          if(routeTableName == "default"){
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