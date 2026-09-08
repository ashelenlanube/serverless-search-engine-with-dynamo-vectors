import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { SearchEngineStack } from '../lib/search-engine-stack.js';

const VECTOR_DIMENSIONS = 512;
const API_ROUTE_COUNT = 3;

describe('SearchEngineStack', () => {
  it('creates the on-demand DynamoDB table, indexes, vector custom resource, and HTTP routes', () => {
    const app = new cdk.App();
    const stack = new SearchEngineStack(app, 'TestStack', { stage: 'dev' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'AutocompleteIndex' }),
        Match.objectLike({ IndexName: 'PopularityIndex' }),
      ]),
    });
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      IndexName: 'ProductEmbeddingIndex',
      Dimensions: VECTOR_DIMENSIONS,
      DistanceFunction: 'COSINE',
    });
    template.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs24.x' });
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({ AllowOrigins: ['http://localhost:5173'] }),
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:Query', 'dynamodb:SearchVectors']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
          }),
        ]),
      },
    });
    template.resourceCountIs('AWS::ApiGatewayV2::Route', API_ROUTE_COUNT);
  });
});
