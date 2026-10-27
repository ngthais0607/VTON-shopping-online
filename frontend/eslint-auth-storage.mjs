/** The auth storage policy is shared by the full linter and its focused regressions. */
/** @type {import('eslint').Linter.Config} */
export const authStorageConfig = {
  files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}", "hooks/**/*.{js,jsx,ts,tsx}", "lib/**/*.{js,jsx,ts,tsx}"],
  rules: {
    "no-restricted-syntax": ["error", {
      selector: "CallExpression[arguments.0.value='token']:matches([callee.property.name='getItem'], [callee.property.value='getItem']):matches([callee.object.name='localStorage'], [callee.object.property.name='localStorage'], [callee.object.property.value='localStorage'])",
      message: "Read auth from the in-memory session using useSession or getAccessToken, never localStorage.",
    }],
  },
};
