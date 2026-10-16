module.exports = {
  testEnvironment: "node",
  moduleNameMapper: { "^@bwip-js/generic$": "<rootDir>/node_modules/@bwip-js/generic/dist/bwip-js-gen.mjs" },
  transformIgnorePatterns: ["node_modules/(?!@bwip-js/generic/)"],
  transform: {
    "^.+\\.(js|mjs)$": [
      "babel-jest",
      {
        babelrc: false,
        configFile: false,
        plugins: ["@babel/plugin-transform-modules-commonjs", "@babel/plugin-transform-react-jsx"],
      },
    ],
  },
};
