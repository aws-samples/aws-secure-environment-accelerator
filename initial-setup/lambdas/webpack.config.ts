import * as path from 'path';
import * as webpack from 'webpack';

const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const config: webpack.Configuration = {
  mode: 'production',
  target: 'node',
  externals: ['aws-sdk', 'aws-lambda'],
  entry: {
    'add-role-to-kms-key': './src/add-role-to-kms-key-step.ts',
    'add-role-to-scp': './src/add-role-to-scp-step.ts',
    'add-role-to-service-catalog': './src/add-role-to-service-catalog-step.ts',
    'add-tags-to-shared-resources': './src/add-tags-to-shared-resources-step.ts',
    'codebuild/start': './src/codebuild/start.ts',
    'codebuild/verify': './src/codebuild/verify.ts',
    'create-account/create': './src/create-account/create.ts',
    'create-account/verify': './src/create-account/verify.ts',
    'create-stack-set/create-stack-set-instances': './src/create-stack-set/create-stack-set-instances.ts',
    'create-stack-set/create-stack-set': './src/create-stack-set/create-stack-set.ts',
    'create-stack-set/delete-stack-set-instances': './src/create-stack-set/delete-stack-set-instances.ts',
    'create-stack-set/update-stack-set-instances': './src/create-stack-set/update-stack-set-instances.ts',
    'create-stack-set/verify': './src/create-stack-set/verify.ts',
    'create-stack/create': './src/create-stack/create.ts',
    'create-stack/verify': './src/create-stack/verify.ts',
    'enable-resource-sharing': './src/enable-resource-sharing-step.ts',
    'get-dns-endpoint-ipaddress': './src/get-dns-endpoint-ips.ts',
    'load-accounts': './src/load-accounts-step.ts',
    'load-configuration': './src/load-configuration-step.ts',
    's3-block-public-access': './src/s3-block-public-access-step.ts',
    'associate-hosted-zones': './src/associate-hosted-zones-step.ts',
    'store-stack-output': './src/store-stack-output-step.ts',
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
