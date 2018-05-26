module.exports = {
  env: {
    node: true,
    es6: true
  },
  plugins: ["prettier"],
  extends: ["standard", "prettier", "prettier/standard"],
  parserOptions: {
    sourceType: "module"
  },
  rules: {
    "prettier/prettier": "error",
    "handle-callback-err": 0,
    "standard/no-callback-literal": 0
  }
};
