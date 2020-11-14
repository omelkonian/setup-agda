#!/bin/bash

H=$1
USER=$2
REPO=$3
    
# Install lib
curl -L https://github.com/$USER/$REPO/archive/master.zip -o $H/$REPO-master.zip
unzip -qq $H/$REPO-master.zip -d $H
echo "$H/$REPO-master/$REPO.agda-lib" $H/.agda/libraries