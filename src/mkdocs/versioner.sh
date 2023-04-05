#!/bin/bash

help=$(cat <<EOF
usage: install [-o tag to replace]
[-n new tag]
[-h help]
EOF
)

while getopts 'o:n:h' flag; do
        case "${flag}" in
        o) OLD_TAG=${OPTARG};;
        n) NEW_TAG=${OPTARG};;
        h) echo ${help} && exit 0;;
        esac
done
shift $((OPTIND -1))

if [ "$OLD_TAG" == "" ]; then
	echo "ERROR: Must supply -o flag with a git tag!"
	exit 1
fi

if [ "$NEW_TAG" == "" ]; then
	echo "ERROR: Must supply -n flag with a git tag!"
	exit 1
fi
echo -e "INFO: starting versioner!\n"

for FILE in find *.yml docs/**/*.md
do
    vim -c "%s/$OLD_TAG/$NEW_TAG/gc" -c 'wq' "$FILE"
done

echo "INFO: versioner complete."
