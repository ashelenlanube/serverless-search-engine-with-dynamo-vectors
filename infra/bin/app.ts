import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { SearchEngineStack } from '../lib/search-engine-stack.js';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') as string | undefined;
const frontendOrigin = app.node.tryGetContext('frontendOrigin') as string | undefined;

new SearchEngineStack(app, 'ServerlessSearchEngineStack', {
  ...(stage ? { stage } : {}),
  ...(frontendOrigin ? { frontendOrigin } : {}),
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
