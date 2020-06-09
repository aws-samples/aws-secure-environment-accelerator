import { Construct, IResolvable } from '@aws-cdk/core';
import { CfnMember, CfnMaster } from '@aws-cdk/aws-guardduty';
import { GuardDutyDetector } from '@custom-resources/guardduty-list-detector';

export interface MemberProps {
  /**
   * `AWS::GuardDuty::Member.Email`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-member.html#cfn-guardduty-member-email
   */
  readonly email: string;
  /**
   * `AWS::GuardDuty::Member.MemberId`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-member.html#cfn-guardduty-member-memberid
   */
  readonly memberId: string;
  /**
   * `AWS::GuardDuty::Member.DisableEmailNotification`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-member.html#cfn-guardduty-member-disableemailnotification
   */
  readonly disableEmailNotification?: boolean | IResolvable;
  /**
   * `AWS::GuardDuty::Member.Message`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-member.html#cfn-guardduty-member-message
   */
  readonly message?: string;
}

export interface GuardDutyMasterProps {
  /**
   * All member account Props used in the organization
   */
  memberProps: MemberProps[];
}

/**
 * Organization GuardDuty Construct, need to deployed to AWS Master Account of the Organization
 */
export class GuardDutyMaster extends Construct {

  constructor(scope: Construct, id: string, props: GuardDutyMasterProps) {
    super(scope, id);

    const guardDutyDetector = new GuardDutyDetector(this, 'MasterDetector');

    props.memberProps.map(memberProps => {
      new CfnMember(this, `GuardDuty_Member_${memberProps.memberId}`, {
        detectorId: guardDutyDetector.getDetectorId(),
        email: memberProps.email,
        memberId: memberProps.memberId,
        status: 'Invited',
        ...memberProps,
      });
    });
  }
}

export interface MasterProps {
  /**
   * `AWS::GuardDuty::Master.MasterId`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-master.html#cfn-guardduty-master-masterid
   */
  readonly masterId: string;
  /**
   * `AWS::GuardDuty::Master.InvitationId`
   * @see http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-guardduty-master.html#cfn-guardduty-master-invitationid
   */
  readonly invitationId?: string;
}
/**
 * Organization GuardDuty Construct, need to deployed to AWS Member Account of the Organization
 * Can only be deployed after GuardDutyMaster deployed to AWS Master Account already
 *
 */
export class GuardDutyMember extends Construct {
  constructor(scope: Construct, id: string, props: MasterProps) {
    super(scope, id);

    const guardDutyDetector = new GuardDutyDetector(this, 'MemberDetector');

    new CfnMaster(this, `GuardDuty_Master_${props.masterId}`, {
      detectorId: guardDutyDetector.getDetectorId(),
      ...props
    });
  }
}
