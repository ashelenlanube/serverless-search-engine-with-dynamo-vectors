import {
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
  type VectorIndexDescription,
} from '@aws-sdk/client-dynamodb';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

const client = new DynamoDBClient({});

interface VectorIndexProperties {
  readonly TableName: string;
  readonly IndexName: string;
  readonly VectorAttribute: string;
  readonly Dimensions: number;
  readonly DistanceFunction: 'COSINE' | 'EUCLIDEAN' | 'DOT_PRODUCT';
  readonly ProjectedAttributes: string[];
  readonly ConfigurationHash: string;
}

interface CallbackContext {
  readonly operation: 'create' | 'delete' | 'replace-delete' | 'replace-create';
}

type ProviderEvent = CloudFormationCustomResourceEvent & {
  readonly OldResourceProperties?: unknown;
  readonly Data?: Record<string, unknown>;
};

function requiredString(value: unknown, propertyName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${propertyName} must be a non-empty string.`);
  }
  return value;
}

function dimensions(value: unknown): number {
  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error('Dimensions must be a positive integer.');
  }
  return parsedValue;
}

function projectedAttributes(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((attribute) => typeof attribute === 'string')) {
    throw new Error('ProjectedAttributes must be an array of strings.');
  }
  return value;
}

function properties(event: ProviderEvent): VectorIndexProperties {
  const resourceProperties = event.ResourceProperties as Record<string, unknown>;
  const distanceFunction = requiredString(resourceProperties.DistanceFunction, 'DistanceFunction');
  if (
    distanceFunction !== 'COSINE' &&
    distanceFunction !== 'EUCLIDEAN' &&
    distanceFunction !== 'DOT_PRODUCT'
  ) {
    throw new Error('DistanceFunction must be COSINE, EUCLIDEAN, or DOT_PRODUCT.');
  }
  return {
    TableName: requiredString(resourceProperties.TableName, 'TableName'),
    IndexName: requiredString(resourceProperties.IndexName, 'IndexName'),
    VectorAttribute: requiredString(resourceProperties.VectorAttribute, 'VectorAttribute'),
    Dimensions: dimensions(resourceProperties.Dimensions),
    DistanceFunction: distanceFunction,
    ProjectedAttributes: projectedAttributes(resourceProperties.ProjectedAttributes),
    ConfigurationHash: requiredString(resourceProperties.ConfigurationHash, 'ConfigurationHash'),
  };
}

function physicalId(props: VectorIndexProperties): string {
  return `${props.TableName}:${props.IndexName}:${props.ConfigurationHash}`;
}

async function findIndex(
  props: VectorIndexProperties,
): Promise<VectorIndexDescription | undefined> {
  const response = await client.send(new DescribeTableCommand({ TableName: props.TableName }));
  return response.Table?.VectorIndexes?.find((index) => index.IndexName === props.IndexName);
}

async function createIndex(props: VectorIndexProperties): Promise<void> {
  await client.send(
    new UpdateTableCommand({
      TableName: props.TableName,
      VectorIndexUpdates: [
        {
          Create: {
            IndexName: props.IndexName,
            VectorAttribute: { AttributeName: props.VectorAttribute },
            Dimensions: props.Dimensions,
            DistanceFunction: props.DistanceFunction,
            Projection: {
              ProjectionType: 'INCLUDE',
              NonKeyAttributes: props.ProjectedAttributes,
            },
          },
        },
      ],
    }),
  );
}

async function deleteIndex(props: VectorIndexProperties): Promise<void> {
  await client.send(
    new UpdateTableCommand({
      TableName: props.TableName,
      VectorIndexUpdates: [{ Delete: { IndexName: props.IndexName } }],
    }),
  );
}

function isImmutableConfigurationChange(event: ProviderEvent): boolean {
  if (event.RequestType !== 'Update') return false;
  const current = properties(event);
  const previous = event.OldResourceProperties as unknown as VectorIndexProperties;
  return current.ConfigurationHash !== previous.ConfigurationHash;
}

export async function onEvent(event: ProviderEvent): Promise<{
  readonly PhysicalResourceId: string;
  readonly Data: { readonly Operation: CallbackContext['operation'] };
}> {
  const props = properties(event);
  const currentIndex = await findIndex(props);

  if (event.RequestType === 'Delete') {
    if (currentIndex) await deleteIndex(props);
    return {
      PhysicalResourceId: event.PhysicalResourceId ?? physicalId(props),
      Data: { Operation: 'delete' },
    };
  }

  if (isImmutableConfigurationChange(event)) {
    if (currentIndex) await deleteIndex(props);
    return { PhysicalResourceId: physicalId(props), Data: { Operation: 'replace-delete' } };
  }

  if (!currentIndex) await createIndex(props);
  return { PhysicalResourceId: physicalId(props), Data: { Operation: 'create' } };
}

export async function isComplete(event: ProviderEvent): Promise<{
  readonly IsComplete: boolean;
  readonly Data?: { readonly Operation: CallbackContext['operation'] };
}> {
  const props = properties(event);
  const operation = (event.Data?.Operation as CallbackContext['operation'] | undefined) ?? 'create';
  const currentIndex = await findIndex(props);

  if (operation === 'delete') return { IsComplete: !currentIndex };

  if (operation === 'replace-delete') {
    if (currentIndex) return { IsComplete: false };
    await createIndex(props);
    return { IsComplete: false, Data: { Operation: 'replace-create' } };
  }

  return { IsComplete: currentIndex?.IndexStatus === 'ACTIVE' };
}
