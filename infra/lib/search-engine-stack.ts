import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { DynamoDbVectorIndex } from '../constructs/vector-index.js';

const AUTOCOMPLETE_INDEX = 'AutocompleteIndex';
const POPULARITY_INDEX = 'PopularityIndex';
const VECTOR_INDEX = 'ProductEmbeddingIndex';
const VECTOR_DIMENSIONS = 512;
const API_BURST_LIMIT = 20;
const API_RATE_LIMIT = 10;
const FUNCTION_TIMEOUT_SECONDS = 10;
const FUNCTION_MEMORY_SIZE_MIB = 256;

export interface SearchEngineStackProps extends cdk.StackProps {
  readonly stage?: string;
  readonly frontendOrigin?: string;
}

interface FunctionOptions {
  readonly id: string;
  readonly entry: string;
  readonly table: dynamodb.Table;
  readonly removalPolicy: cdk.RemovalPolicy;
  readonly extraEnvironment?: Record<string, string>;
}

interface FunctionHandlers {
  readonly search: NodejsFunction;
  readonly popular: NodejsFunction;
  readonly recordClick: NodejsFunction;
}

interface ApiOptions {
  readonly handlers: FunctionHandlers;
  readonly frontendOrigin: string;
  readonly removalPolicy: cdk.RemovalPolicy;
}

export class SearchEngineStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: SearchEngineStackProps = {}) {
    super(scope, id, props);
    const stage = props.stage ?? 'prod';
    const isDemoStage = stage === 'demo' || stage === 'dev';
    const frontendOrigin = props.frontendOrigin ?? 'http://localhost:5173';
    const removalPolicy = isDemoStage ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;
    const table = this.createProductsTable(isDemoStage, removalPolicy);
    const functions = this.createFunctions(table, removalPolicy);
    this.configureFunctionPermissions(functions, table);
    const api = this.createApi({ handlers: functions, frontendOrigin, removalPolicy });
    this.createOutputs(api, table);
    this.addNagSuppressions();
  }

  private createProductsTable(
    isDemoStage: boolean,
    removalPolicy: cdk.RemovalPolicy,
  ): dynamodb.Table {
    const table = new dynamodb.Table(this, 'ProductsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      deletionProtection: !isDemoStage,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    table.addGlobalSecondaryIndex({
      indexName: AUTOCOMPLETE_INDEX,
      partitionKey: { name: 'nameInitial', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'normalizedName', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'name',
        'normalizedName',
        'description',
        'category',
        'tags',
        'imageUrl',
        'score',
      ],
    });
    table.addGlobalSecondaryIndex({
      indexName: POPULARITY_INDEX,
      partitionKey: { name: 'popularityKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'score', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'name',
        'normalizedName',
        'description',
        'category',
        'tags',
        'imageUrl',
        'score',
      ],
    });

    new DynamoDbVectorIndex(this, 'ProductEmbeddingVectorIndex', {
      table: table as dynamodb.ITable,
      indexName: VECTOR_INDEX,
      vectorAttribute: 'embedding',
      dimensions: VECTOR_DIMENSIONS,
      distanceFunction: 'COSINE',
      projectedAttributes: [
        'name',
        'normalizedName',
        'description',
        'category',
        'tags',
        'imageUrl',
        'score',
      ],
    });

    return table;
  }

  private createFunctions(
    table: dynamodb.Table,
    removalPolicy: cdk.RemovalPolicy,
  ): FunctionHandlers {
    return {
      search: this.createFunction({
        id: 'SearchFunction',
        entry: 'search.ts',
        table,
        removalPolicy,
        extraEnvironment: { VECTOR_INDEX },
      }),
      popular: this.createFunction({
        id: 'PopularFunction',
        entry: 'popular.ts',
        table,
        removalPolicy,
      }),
      recordClick: this.createFunction({
        id: 'RecordClickFunction',
        entry: 'record-click.ts',
        table,
        removalPolicy,
      }),
    };
  }

  private configureFunctionPermissions(functions: FunctionHandlers, table: dynamodb.Table): void {
    functions.search.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query', 'dynamodb:SearchVectors'],
        resources: [table.tableArn, `${table.tableArn}/index/${AUTOCOMPLETE_INDEX}`],
      }),
    );
    functions.search.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:bedrock:${cdk.Aws.REGION}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }),
    );
    functions.popular.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [`${table.tableArn}/index/${POPULARITY_INDEX}`],
      }),
    );
    functions.recordClick.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['dynamodb:UpdateItem'], resources: [table.tableArn] }),
    );
  }

  private createApi(options: ApiOptions): apigatewayv2.HttpApi {
    const api = new apigatewayv2.HttpApi(this, 'SearchApi', {
      createDefaultStage: false,
      corsPreflight: {
        allowHeaders: ['content-type'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowOrigins: [options.frontendOrigin],
        maxAge: cdk.Duration.hours(1),
      },
    });
    const apiAccessLogs = new logs.LogGroup(this, 'SearchApiAccessLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: options.removalPolicy,
    });
    new apigatewayv2.HttpStage(this, 'DefaultStage', {
      httpApi: api,
      accessLogSettings: {
        destination: new apigatewayv2.LogGroupLogDestination(apiAccessLogs),
        format: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
      throttle: { burstLimit: API_BURST_LIMIT, rateLimit: API_RATE_LIMIT },
    });
    api.addRoutes({
      path: '/popular',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'PopularIntegration',
        options.handlers.popular,
      ),
    });
    api.addRoutes({
      path: '/search',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'SearchIntegration',
        options.handlers.search,
      ),
    });
    api.addRoutes({
      path: '/products/{id}/click',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'RecordClickIntegration',
        options.handlers.recordClick,
      ),
    });
    return api;
  }

  private createOutputs(api: apigatewayv2.HttpApi, table: dynamodb.Table): void {
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new cdk.CfnOutput(this, 'ProductsTableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ProductEmbeddingIndexName', { value: VECTOR_INDEX });
  }

  private addNagSuppressions(): void {
    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'CDK NodejsFunction and Provider framework attach the baseline Lambda logs managed policy; application data and Bedrock permissions are explicitly scoped.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'The CDK Provider waiter requires version-qualified handler ARNs with a trailing wildcard; application policies do not use wildcard resources.',
        },
        {
          id: 'AwsSolutions-SF1',
          reason:
            'The generated Provider waiter is bounded to 30 minutes and delegates operational logging to Lambda handlers.',
        },
        {
          id: 'AwsSolutions-SF2',
          reason:
            'The generated Provider waiter handles only vector-index polling; application tracing is introduced with Phase 3 handlers.',
        },
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Authentication is intentionally out of scope for this public local/tutorial demo, as recorded in the project plan.',
        },
      ],
      true,
    );
  }

  private createFunction(options: FunctionOptions): NodejsFunction {
    const logGroup = new logs.LogGroup(this, `${options.id}LogGroup`, {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: options.removalPolicy,
    });
    return new NodejsFunction(this, options.id, {
      entry: join(import.meta.dirname, '..', 'functions', options.entry),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(FUNCTION_TIMEOUT_SECONDS),
      memorySize: FUNCTION_MEMORY_SIZE_MIB,
      logGroup,
      environment: { TABLE_NAME: options.table.tableName, ...options.extraEnvironment },
      bundling: { minify: true, sourceMap: true },
    });
  }
}
