import { Construct } from '@aws-cdk/core';
import { CfnDetector, CfnMember, CfnMemberProps, CfnMaster, CfnMasterProps } from '@aws-cdk/aws-guardduty';

export interface GuardDutyMasterProps {
  /**
   * All member account IDs used in the organization
   */
  memberProps: CfnMemberProps[];
}

/**
 * Organization GuardDuty Construct, need to deployed to AWS Master Account of the Organization
 */
export class GuardDutyMaster extends Construct {
  readonly detector: CfnDetector;

  constructor(scope: Construct, id: string, props: GuardDutyMasterProps) {
    super(scope, id);

    this.detector = new CfnDetector(this, 'Detector', {
      enable: true,
    });

    props.memberProps.map(memberProps => {
      new CfnMember(this, `GuardDuty_Member_${memberProps.memberId}`, {
        detectorId: this.detector.ref,
        email: memberProps.email,
        memberId: memberProps.memberId,
        status: 'Invited',
        ...memberProps,
      });
    });
  }
}

/**
 * Organization GuardDuty Construct, need to deployed to AWS Member Account of the Organization
 * Can only be deployed after GuardDutyMaster deployed to AWS Master Account already
 *
 */
export class GuardDutyMember extends Construct {
  constructor(scope: Construct, id: string, props: CfnMasterProps) {
    super(scope, id);

    new CfnMaster(this, `GuardDuty_Master_${props.masterId}`, props);
  }
}
