import nextVitals from "eslint-config-next/core-web-vitals";
import { authStorageConfig } from "./eslint-auth-storage.mjs";

const eslintConfig = [
  ...nextVitals,
  authStorageConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
