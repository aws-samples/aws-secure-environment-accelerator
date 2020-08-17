import * as path from 'path';
import * as webpack from 'webpack';

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const config: webpack.Configuration = {
  mode: 'production',
  target: 'node',
  externals: ['aws-sdk', 'aws-lambda'],
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
            cacheCompression: false,
            presets: [
              [
                '@babel/env',
                {
                  targets: {
                    node: '12',
                  },
                },
              ],
              '@babel/typescript',
            ],
            plugins: [
              '@babel/proposal-class-properties',
              [
                '@babel/plugin-transform-typescript',
                {
                  allowNamespaces: 'true',
                  onlyRemoveTypeImports: 'true',
                },
              ],
            ],
          },
        },
      },
    ],
  },
  plugins: [new ForkTsCheckerWebpackPlugin()],
};

export default config;
