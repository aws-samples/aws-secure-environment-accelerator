# os-loader.zip

If you need to make changes to the OpenSearch process config file (INI) or the processing source code. Do the following:

1. Extract the zip file
```
unzip os-loader.zip -d osloader
```

2. The files are extracted to the diretory 'osloader'. Make the necesseary changes to the os-loader source or **aws.ini** configuration file.

3. Re-create the zip file with the following command:
```
cd osloader
zip -r ../os-loader.zip .
```

