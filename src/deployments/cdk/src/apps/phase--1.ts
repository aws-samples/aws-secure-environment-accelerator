import { PhaseInput } from './shared';
import * as globalRoles from '../deployments/iam';

/**
 * This is the main entry point to deploy phase -1.
 *
 * The following resources are deployed in phase -1:
 *   - Creating required roles for macie custom resources
 *   - Creating required roles for guardDuty custom resources
 *   - Creating required roles for securityHub custom resources
 *   - Creating required roles for IamCreateRole custom resource
 *   - Creating required roles for createSSMDocument custom resource
 *   - Creating required roles for createLogGroup custom resource
 *   - Creating required roles for CWLCentralLoggingSubscriptionFilterRole custom resource
 *   - Creating required roles for createLogsMetricFilter custom resource
 *   - Creating required roles for SnsSubscriberLambda custom resource
 */
export async function deploy({ acceleratorConfig, accountStacks, accounts }: PhaseInput) {
  // creates roles for macie custom resources
  await globalRoles.createMacieRoles({
    accountStacks,
    config: acceleratorConfig,
  });

  // creates roles for guardDuty custom resources
  await globalRoles.createGuardDutyRoles({
    accountStacks,
    config: acceleratorConfig,
  });

  // creates roles for securityHub custom resources
  await globalRoles.createSecurityHubRoles({
    accountStacks,
    accounts,
  });

  // Creates roles for IamCreateRole custom resource
  await globalRoles.createIamRole({
    accountStacks,
    accounts,
  });

  // Creates roles for createSSMDocument custom resource
  await globalRoles.createSSMDocumentRoles({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates roles for createLogGroup custom resource
  await globalRoles.createLogGroupRole({
    accountStacks,
    accounts,
  });

  // Creates roles for createCwlSubscriptionFilter custom resource
  await globalRoles.createCwlAddSubscriptionFilterRoles({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates role for SnsSubscriberLambda function
  await globalRoles.createSnsSubscriberLambdaRole({
    accountStacks,
    accounts,
    config: acceleratorConfig,
  });

  // Creates role for createLogsMetricFilter custom resource
  await globalRoles.createLogsMetricFilterRole({
    accountStacks,
    accounts,
  });
}
