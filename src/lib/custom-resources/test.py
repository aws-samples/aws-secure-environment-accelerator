import os
import json
rootdir = '/Users/rverma/dev/aws-secure-environment-accelerator/src/lib/custom-resources'

for subdir, dirs, files in os.walk(rootdir):
    for file in files:
        if file == 'package.json':
            with open(os.path.join(subdir, file), "r") as jsonFile:
                print(jsonFile)
                dependencies,peerDependencies,devDependencies = set(),set(),set()
                data = json.load(jsonFile)
                try:
                    dependencies = set(data["dependencies"])
                except Exception: 
                    pass
                try:
                    peerDependencies=set(data["peerDependencies"])
                except Exception: 
                    pass
                try:
                    devDependencies=set(data["devDependencies"])
                except Exception: 
                    pass
                incorrect=dependencies.difference(peerDependencies)
                moved=devDependencies.union(peerDependencies)
                data["dependencies"]=list(incorrect)
                data["devDependencies"]=list(moved)

                with open(file, "w") as jsonFile:
                    json.dump(data, jsonFile)

