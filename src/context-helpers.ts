/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConstructNode } from '@aws-cdk/core'

/**
 * Finds all key value pairs from context of the form
 * { "namespace:key": "value" } and flattens it to an object
 * of the form { "key": "value" }.
 *
 * @param namespace The prefix to find in the context keys
 */
export const getContextByNamespace = (namespace: string): any => {
  const allContext = JSON.parse(process.env.CDK_CONTEXT_JSON ?? '{}')
  const result: any = {}
  const prefix = `${namespace}:`
  for (const [key, value] of Object.entries(allContext)) {
    if (key.startsWith(prefix)) {
      const flattenedKey = key.substr(prefix.length)
      result[flattenedKey] = value
    }
  }
  return result
}

/**
 * Extends the built-in tryGetContext to throw an error if the key
 * is not found
 *
 * @param node The node to search under for the context key
 * @param key The required key to look for
 */
export const getRequiredContext = (node: ConstructNode, key: string): any => {
  const value = node.tryGetContext(key)
  if (value === undefined || value === null) {
    throw new Error(`Context key '${key}' is required.`)
  }
  return value
}
