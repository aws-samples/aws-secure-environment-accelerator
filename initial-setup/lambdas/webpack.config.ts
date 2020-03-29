import * as path from 'path';
import * as webpack from 'webpack';

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const config: webpack.Configuration = {
  mode: 'production',
  target: 'node',
  externals: ['aws-sdk'],
  entry: {
    'create-stack/trigger': './src/create-stack/trigger.ts',
    'create-stack/create': './src/create-stack/create.ts',
    'create-stack/verify': './src/create-stack/verify.ts',
    'create-stack/finalize': './src/create-stack/finalize.ts',
    'create-stack-set/trigger': './src/create-stack-set/trigger.ts',
    'create-stack-set/create-stack-set': './src/create-stack-set/create-stack-set.ts',
    'create-stack-set/create-stack-set-instances': './src/create-stack-set/create-stack-set-instances.ts',
    'create-stack-set/verify': './src/create-stack-set/verify.ts',
    'create-stack-set/finalize': './src/create-stack-set/finalize.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/index.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
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
                },
              ],
            ],
          },
        },
      },
    ],
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin(),
  ],
};

export default config;