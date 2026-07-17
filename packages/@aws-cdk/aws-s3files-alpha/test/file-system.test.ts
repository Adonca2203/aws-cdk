import { Duration, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { FileSystem, IpAddressType } from '../lib';

describe('FileSystem', () => {
  test('creates with minimal props', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3Files::FileSystem', {
      Bucket: { 'Fn::GetAtt': ['Bucket83908E77', 'Arn'] },
      AcceptBucketWarning: true,
    });
  });

  test('creates mount targets in selected subnets', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2 });
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::S3Files::MountTarget', 2);
  });

  test('creates security group with NFS ingress', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for S3 Files mount targets',
      SecurityGroupIngress: [
        {
          CidrIp: { 'Fn::GetAtt': ['Vpc8378EB38', 'CidrBlock'] },
          FromPort: 2049,
          ToPort: 2049,
          IpProtocol: 'tcp',
        },
      ],
    });
  });

  test('creates IAM role with S3 and EventBridge permissions', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: { Service: 'elasticfilesystem.amazonaws.com' },
        }],
      },
    });
  });

  test('adds KMS permissions when kmsKey is provided', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });
    const key = new kms.Key(stack, 'Key');

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
      kmsKey: key,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3Files::FileSystem', {
      KmsKeyId: { 'Fn::GetAtt': ['Key961B73FD', 'Arn'] },
    });
  });

  test('supports ipAddressType on mount targets', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 1 });
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        ipAddressType: IpAddressType.DUAL_STACK,
      },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3Files::MountTarget', {
      IpAddressType: 'DUAL_STACK',
    });
  });

  test('validates importDataRules count', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    expect(() => {
      new FileSystem(stack, 'FileSystem', {
        bucket,
        vpcConfiguration: {
          vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        },
        synchronizationConfiguration: {
          importDataRules: [],
          daysAfterLastAccess: Duration.days(30),
        },
      });
    }).toThrow(/importDataRules must contain between 1 and 10 rules/);
  });

  test('validates importDataRule prefix format', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    expect(() => {
      new FileSystem(stack, 'FileSystem', {
        bucket,
        vpcConfiguration: {
          vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        },
        synchronizationConfiguration: {
          importDataRules: [{ prefix: 'data' }],
          daysAfterLastAccess: Duration.days(30),
        },
      });
    }).toThrow(/importDataRule prefix must be empty or end with/);
  });

  test('validates daysAfterLastAccess range', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });

    expect(() => {
      new FileSystem(stack, 'FileSystem', {
        bucket,
        vpcConfiguration: {
          vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        },
        synchronizationConfiguration: {
          importDataRules: [{ prefix: '/' }],
          daysAfterLastAccess: Duration.days(400),
        },
      });
    }).toThrow(/daysAfterLastAccess must be a whole number of days between 1 and 365/);
  });

  test('imports from fileSystemArn', () => {
    const stack = new Stack();
    const sg = ec2.SecurityGroup.fromSecurityGroupId(stack, 'SG', 'sg-12345');

    const fs = FileSystem.fromFileSystemAttributes(stack, 'Imported', {
      fileSystemArn: 'arn:aws:s3files:us-east-1:123456789012:file-system/fs-12345678',
      securityGroup: sg,
    });

    expect(fs.fileSystemArn).toBe('arn:aws:s3files:us-east-1:123456789012:file-system/fs-12345678');
  });

  test('grant read adds correct actions', () => {
    const stack = new Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');
    const bucket = new s3.Bucket(stack, 'Bucket', { versioned: true });
    const role = new iam.Role(stack, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    const fs = new FileSystem(stack, 'FileSystem', {
      bucket,
      vpcConfiguration: {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    });

    fs.grants.read(role);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [{
          Action: 's3files:ClientMount',
          Effect: 'Allow',
        }],
      },
    });
  });
});
