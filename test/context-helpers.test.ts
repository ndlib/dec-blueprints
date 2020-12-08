import { App } from '@aws-cdk/core'
import { getContextByNamespace, getRequiredContext } from '../src/context-helpers'

test('getContextByNamespace', () => {
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    'a:a': 'aa',
    'a:b': 'ab',
    'b:a': 'ba',
    'b:b': 'bb',
    cc: 'cc',
  })
  expect(getContextByNamespace('a')).toEqual({ a: 'aa', b: 'ab' })
  expect(getContextByNamespace('b')).toEqual({ a: 'ba', b: 'bb' })
  expect(getContextByNamespace('c')).toEqual({})
})

describe('getRequiredContext', () => {
  test('does not throw an error when key is found', () => {
    process.env.CDK_CONTEXT_JSON = JSON.stringify({
      requiredKey: 'requiredValue',
    })
    const app = new App()
    expect(() => getRequiredContext(app.node, 'requiredKey')).not.toThrow()
  })

  test('throws an error when key is not found', () => {
    process.env.CDK_CONTEXT_JSON = ''
    const app = new App()
    expect(() => getRequiredContext(app.node, 'requiredKey')).toThrow()
  })
})
