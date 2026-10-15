// @vitest-environment node
import path from 'node:path';
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

const expressions = [
  "localStorage.getItem('token')",
  'localStorage.getItem("token")',
  'window.localStorage.getItem("token")',
  'localStorage["getItem"]("token")',
];
const locations = ['app/auth-lint-probe.tsx', 'components/auth-lint-probe.tsx', 'hooks/auth-lint-probe.ts', 'lib/auth-lint-probe.ts'];
it.each(locations.flatMap(file => expressions.map(expression => ({file, expression}))))('forbids $expression in $file', async ({file, expression}) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(`export const read = () => ${expression};`, {filePath: path.resolve(file)});
  expect(result.messages.some(message => message.ruleId === 'no-restricted-syntax')).toBe(true);
});

it('allows persisted shopping cart data', async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText("export const read = () => localStorage.getItem('truelook_cart_v2');", {filePath:path.resolve('lib/cart-lint-probe.ts')});
  expect(result.errorCount).toBe(0);
});
