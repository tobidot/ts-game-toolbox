const {
    defineConfig,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([
    {
        languageOptions: {
            parser: tsParser,
        },

        plugins: {
            "@typescript-eslint": typescriptEslint,
        },

        extends: compat.extends(
            "eslint:recommended",
            "plugin:@typescript-eslint/recommended",
            "prettier",
        ),

        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "no-unused-vars": "off",

            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                },
            ],

            "@typescript-eslint/naming-convention": [
                "error",
                {
                    selector: "default",
                    format: ["snake_case"],
                },
                {
                    selector: "typeLike",
                    format: ["PascalCase"],
                },
                {
                    selector: "typeParameter",
                    format: ["UPPER_CASE"],
                },
                {
                    selector: "variable",
                    modifiers: ["const"],
                    format: ["snake_case", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "variable",
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "parameter",
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "memberLike",
                    modifiers: ["private"],
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: ["method", "property"],
                    filter: {
                        // These are standard DOM/JS methods/properties that use camelCase
                        regex: "^(querySelector|getElementById|getElementsByClassName|toString|item|toJSON|valueOf)$",
                        match: true,
                    },
                    format: null,
                },
                {
                    selector: "method",
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "property",
                    format: ["snake_case", "UPPER_CASE"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "accessor",
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "enumMember",
                    format: ["UPPER_CASE"],
                },
            ],
        },
    },
]);
