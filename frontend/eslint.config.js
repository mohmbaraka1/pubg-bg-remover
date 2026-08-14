import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // "تحميل بيانات عند فتح الصفحة" (useEffect(() => { fetchX() }, []))
      // هو النمط القياسي بكل الملفات هون - قاعدة React Compiler الجديدة
      // بتحذّر منه عموماً، بس تحويله لنمط "مثالي" (state machine/query lib)
      // بكل مكان بيحتاج إعادة هيكلة حقيقية بمخاطرها الخاصة، مو تصحيح خطأ.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
