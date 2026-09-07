import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

const PROVIDER_QUERY_INTERVAL_SECONDS = 10;
const PROVIDER_TOTAL_TIMEOUT_MINUTES = 30;

export interface DynamoDbVectorIndexProps {
  readonly table: dynamodb.ITable;
  readonly indexName: string;
  readonly vectorAttribute: string;
  readonly dimensions: number;
  readonly distanceFunction: 'COSINE' | 'EUCLIDEAN' | 'DOT_PRODUCT';
  readonly projectedAttributes: readonly string[];
}

export class DynamoDbVectorIndex extends Construct {
  public readonly indexName: string;

  public constructor(scope: Construct, id: string, props: DynamoDbVectorIndexProps) {
    super(scope, id);
    this.indexName = props.indexName;

    const providerHandler = new NodejsFunction(this, 'OnEventHandler', {
      entry: join(import.meta.dirname, 'vector-index-provider.ts'),
      handler: 'onEvent',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(1),
      bundling: { minify: true, sourceMap: true, externalModules: [] },
    });
    const completionHandler = new NodejsFunction(this, 'IsCompleteHandler', {
      entry: join(import.meta.dirname, 'vector-index-provider.ts'),
      handler: 'isComplete',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(1),
      bundling: { minify: true, sourceMap: true, externalModules: [] },
    });

    const policy = new iam.PolicyStatement({
      actions: ['dynamodb:DescribeTable', 'dynamodb:UpdateTable'],
      resources: [props.table.tableArn],
    });
    providerHandler.addToRolePolicy(policy);
    completionHandler.addToRolePolicy(policy);

    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: providerHandler,
      isCompleteHandler: completionHandler,
      queryInterval: cdk.Duration.seconds(PROVIDER_QUERY_INTERVAL_SECONDS),
      totalTimeout: cdk.Duration.minutes(PROVIDER_TOTAL_TIMEOUT_MINUTES),
    });
    const configurationHash = createHash('sha256')
      .update(
        JSON.stringify({
          indexName: props.indexName,
          vectorAttribute: props.vectorAttribute,
          dimensions: props.dimensions,
          distanceFunction: props.distanceFunction,
          projectedAttributes: [...props.projectedAttributes].sort(),
        }),
      )
      .digest('hex');

    new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        TableName: props.table.tableName,
        IndexName: props.indexName,
        VectorAttribute: props.vectorAttribute,
        Dimensions: props.dimensions,
        DistanceFunction: props.distanceFunction,
        ProjectedAttributes: props.projectedAttributes,
        ConfigurationHash: configurationHash,
        ProviderVersion: providerHandler.currentVersion.version,
      },
    });
  }
}
