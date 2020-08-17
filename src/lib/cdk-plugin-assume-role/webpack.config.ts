import * as path from 'path';
import * as webpack from 'webpack';
import WebpackShellPlugin from 'webpack-shell-plugin-next';
import pkg from './package.json';

const sourcePath = path.resolve(pkg.source);

const outputPath = path.resolve(pkg.main);
const outputFile = path.basename(outputPath);
const outputDir = path.dirname(outputPath);

const config: webpack.Configuration = {
  mode: 'production',
  target: 'node',
  entry: sourcePath,
  output: {
    path: outputDir,
    filename: outputFile,
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
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
    ],
  },
  plugins: [
    new WebpackShellPlugin({
      onBuildStart: {
        scripts: [`tsc --declaration --emitDeclarationOnly --outDir ${outputDir}`],
        blocking: false,
        parallel: false,
      },
      safe: true,
    }),
  ],
};

export default config;
