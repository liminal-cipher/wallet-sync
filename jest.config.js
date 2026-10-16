module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.js$": [
      "babel-jest",
      {
        babelrc: false,
        configFile: false,
        plugins: ["@babel/plugin-transform-modules-commonjs"],
      },
    ],
  },
};
